// The orchestration behind the screens: each function is one whole interaction, written as a sequence of
// plain steps. The screens only render the states these functions emit, so every rule that matters
// (what gets verified, who signs, what is refused) lives here and in verify.ts, not in a component.

import type { FeeBumpTransaction, Keypair, Transaction } from '@stellar/stellar-sdk';
import type { RecordSummary } from '../book';
import { fromStroops, toStroops } from '../chain/amount';
import { buyOnCredit, closeCredit, feeBump, joinAndOpen, openCredit, repayCash, setLimit, setupShop } from '../chain/builders';
import { accountExists, ChainRefusal, readProfile, server, submit } from '../chain/horizon';
import type { BuyOffer, JoinOffer, SessionView } from '../handoff/session';
import { verifyJoin, verifyPurchase } from '../handoff/verify';
import { explainRefusal } from './explain';
import { createSession, HandoffError, readSession, sessionLink, waitFor, writeSlot, type Waited } from './handoff';
import { loadRecord, loadShopProfiles, loadTabs, type ShopProfiles, type Tab } from './reads';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const xdrOf = (tx: Transaction | FeeBumpTransaction) => tx.toEnvelope().toXDR('base64');

/** A person-readable message for anything that can go wrong. */
export function messageOf(e: unknown): string {
  if (e instanceof ChainRefusal) return explainRefusal(e);
  if (e instanceof HandoffError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

// ------------------------------------------------------------------------------------------------ shop side

export type ShopFlowState =
  | { step: 'link'; link: string; status: string }
  /** The customer said hello. The shopkeeper sees their record and decides before anything is built. */
  | { step: 'review_customer'; name: string; existing: boolean; record: RecordSummary | null; shops: ShopProfiles; approve: () => void; decline: () => void }
  | { step: 'done'; hash: string; message: string }
  | { step: 'refused'; hash: string | null; message: string; overLimit: boolean }
  | { step: 'failed'; message: string }
  | { step: 'expired' };

type EmitShop = (s: ShopFlowState) => void;

/** Unwraps a finished wait, or emits why it did not finish. Returns null when the flow must stop. */
function settle<T>(w: Waited<T>, emit: EmitShop): T | null {
  if (w.status === 'ok') return w.value;
  if (w.status === 'expired') emit({ step: 'expired' });
  else if (w.status === 'timeout') emit({ step: 'failed', message: 'Nobody answered in time. Start again.' });
  return null; // aborted: the person moved on, say nothing
}

async function send(tx: Transaction | FeeBumpTransaction, emit: EmitShop, okMessage: string): Promise<void> {
  try {
    const r = await submit(tx);
    emit({ step: 'done', hash: r.hash, message: okMessage });
  } catch (e) {
    if (e instanceof ChainRefusal) emit({ step: 'refused', hash: e.hash, message: explainRefusal(e), overLimit: e.has('op_line_full') });
    else emit({ step: 'failed', message: `Could not reach the network (${messageOf(e)}). The change may or may not have gone through: refresh the book before trying again.` });
  }
}

/** First visit: the customer scans, says hello, the shop builds the join, the customer signs, the shop submits. */
export async function runJoin(
  kp: Keypair,
  p: { shopName: string; currency: string; limit: string; origin: string },
  emit: EmitShop,
  signal: AbortSignal,
): Promise<void> {
  const shop = kp.publicKey();
  const offer: JoinOffer = { kind: 'join', shop, shopName: p.shopName, currency: p.currency, limit: p.limit };
  const made = await createSession(offer);
  const link = sessionLink(p.origin, 'join', made.id);
  emit({ step: 'link', link, status: 'Waiting for the customer to scan…' });

  const hello = settle(await waitFor(made.id, (s) => s.hello, { signal }), emit);
  if (!hello) return;
  const existing = await accountExists(hello.pub);
  const history = existing ? await loadRecord(hello.pub).catch(() => null) : null;
  const shops = history ? await loadShopProfiles(history.perShop.map((s) => s.shop)).catch(() => ({})) : {};
  const decision = await new Promise<'yes' | 'no'>((resolve) => {
    if (signal.aborted) {
      resolve('no');
      return;
    }
    signal.addEventListener('abort', () => resolve('no'), { once: true });
    emit({ step: 'review_customer', name: hello.name, existing, record: history, shops, approve: () => resolve('yes'), decline: () => resolve('no') });
  });
  if (decision === 'no') {
    if (!signal.aborted) emit({ step: 'failed', message: `${hello.name} was not added. Their code expires on its own.` });
    return;
  }
  emit({ step: 'link', link, status: `Preparing ${hello.name}’s credit line…` });

  const acct = await server.loadAccount(shop);
  const tx = existing
    ? openCredit({ shop: acct, customer: hello.pub, limit: p.limit })
    : joinAndOpen({ shop: acct, customer: hello.pub, limit: p.limit, name: hello.name });
  tx.sign(kp);
  await writeSlot(made.id, 'request', { xdr: xdrOf(tx) });
  emit({ step: 'link', link, status: `Waiting for ${hello.name} to check and sign…` });

  const resp = settle(await waitFor(made.id, (s) => s.response, { signal }), emit);
  if (!resp) return;
  emit({ step: 'link', link, status: 'Checking their signature and sending to the network…' });
  const v = verifyJoin(resp.xdr, { shop, customer: hello.pub, limit: p.limit, name: hello.name, existing }, { requireSigned: [shop, hello.pub] });
  if (!v.ok) {
    emit({ step: 'failed', message: v.reason });
    return;
  }
  await send(v.tx, emit, `${hello.name} now has a credit line.`);
}

/** A purchase on credit: the customer builds and signs it, the shop verifies, pays the fee, and submits. */
export async function runSale(
  kp: Keypair,
  p: { customer: string; amount: string; item: string; due?: string; currency: string; origin: string },
  emit: EmitShop,
  signal: AbortSignal,
): Promise<void> {
  const shop = kp.publicKey();
  const offer: BuyOffer = { kind: 'buy', shop, customer: p.customer, amount: p.amount, item: p.item, ...(p.due ? { due: p.due } : {}), currency: p.currency };
  const made = await createSession(offer);
  const link = sessionLink(p.origin, 'buy', made.id);
  emit({ step: 'link', link, status: 'Waiting for the customer to scan and sign…' });

  const resp = settle(await waitFor(made.id, (s) => s.response, { signal }), emit);
  if (!resp) return;
  emit({ step: 'link', link, status: 'Checking the signature and sending to the network…' });
  const v = verifyPurchase(resp.xdr, { shop, customer: p.customer, amount: p.amount, note: { item: p.item, due: p.due } }, { requireSigned: [p.customer] });
  if (!v.ok) {
    emit({ step: 'failed', message: v.reason });
    return;
  }
  const outer = feeBump(v.tx, shop);
  outer.sign(kp);
  await send(outer, emit, `Recorded: ${p.item}.`);
}

/** The shop returns the customer's IOU to them (a cash repayment), or writes the debt off. */
export async function repay(kp: Keypair, p: { customer: string; amount: string; kind?: 'cash' | 'forgiven' }): Promise<string> {
  const tx = repayCash({ shop: await server.loadAccount(kp.publicKey()), customer: p.customer, amount: p.amount, kind: p.kind });
  tx.sign(kp);
  return (await submit(tx)).hash;
}

/** Change a customer's credit limit. Refused here, with the reason, if it would sit below what is owed. */
export async function changeLimit(kp: Keypair, p: { customer: string; limit: string; owed: bigint }): Promise<string> {
  const tx = setLimit({ shop: await server.loadAccount(kp.publicKey()), customer: p.customer, limit: p.limit, owed: fromStroops(p.owed) });
  tx.sign(kp);
  return (await submit(tx)).hash;
}

/** Close a settled line: it disappears from the book, and the customer's record keeps the history. */
export async function closeLine(kp: Keypair, p: { customer: string; owed: bigint }): Promise<string> {
  const tx = closeCredit({ shop: await server.loadAccount(kp.publicKey()), customer: p.customer, owed: fromStroops(p.owed) });
  tx.sign(kp);
  return (await submit(tx)).hash;
}

/** Brand-new shop: get test XLM, then publish the shop's name and currency on its own account. */
export async function setupShopAccount(kp: Keypair, p: { name: string; currency: string }, progress: (text: string) => void): Promise<void> {
  const id = kp.publicKey();
  if (!(await accountExists(id))) {
    progress('Getting test money for your shop…');
    const res = await fetch('/api/fund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: id }) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `funding failed (${res.status})`);
    for (let i = 0; i < 25 && !(await accountExists(id)); i++) await sleep(1000);
  }
  progress('Publishing your shop name…');
  const tx = setupShop({ shop: await server.loadAccount(id), name: p.name, currency: p.currency });
  tx.sign(kp);
  await submit(tx);
}

// -------------------------------------------------------------------------------------------- customer side

export type CustomerJoinState =
  | { step: 'waiting_shop' }
  | { step: 'review'; shopName: string; currency: string; limit: bigint; existing: boolean; tx: Transaction }
  | { step: 'sent' }
  | { step: 'done'; tab: Tab | null }
  | { step: 'failed'; message: string }
  | { step: 'expired' };

type EmitJoin = (s: CustomerJoinState) => void;

async function settleJoin<T>(w: Waited<T>, emit: EmitJoin): Promise<T | null> {
  if (w.status === 'ok') return w.value;
  if (w.status === 'expired') emit({ step: 'expired' });
  else if (w.status === 'timeout') emit({ step: 'failed', message: 'The shop did not answer in time. Ask them to start again.' });
  return null;
}

/** Say hello, then wait for the shop's transaction and verify it against what the shop promised on screen. */
export async function awaitJoinRequest(kp: Keypair, offer: JoinOffer, id: string, name: string, emit: EmitJoin, signal: AbortSignal): Promise<void> {
  const me = kp.publicKey();
  try {
    await writeSlot(id, 'hello', { pub: me, name });
  } catch (e) {
    // A reload mid-flow leaves our own earlier hello in place: that is fine. Anyone else's is not.
    const s = e instanceof HandoffError && e.status === 409 ? await readSession(id) : null;
    if (s?.hello?.pub !== me) throw e;
  }
  emit({ step: 'waiting_shop' });
  const req = await settleJoin(await waitFor(id, (s: SessionView) => s.request, { signal }), emit);
  if (!req) return;

  const existing = await accountExists(me);
  const v = verifyJoin(req.xdr, { shop: offer.shop, customer: me, limit: offer.limit, name, existing }, { requireSigned: [offer.shop] });
  if (!v.ok) {
    emit({ step: 'failed', message: v.reason });
    return;
  }
  const onChain = await readProfile(offer.shop).catch(() => null);
  emit({ step: 'review', shopName: onChain?.name ?? offer.shopName, currency: offer.currency, limit: toStroops(offer.limit), existing, tx: v.tx });
}

/** The customer signs the verified join and sends it back, then waits to see their tab appear. */
export async function signJoin(kp: Keypair, offer: JoinOffer, id: string, tx: Transaction, emit: EmitJoin, signal: AbortSignal): Promise<void> {
  tx.sign(kp);
  await writeSlot(id, 'response', { xdr: xdrOf(tx) });
  emit({ step: 'sent' });
  for (let i = 0; i < 45 && !signal.aborted; i++) {
    const tab = (await loadTabs(kp.publicKey())).find((t) => t.shop === offer.shop) ?? null;
    if (tab) {
      emit({ step: 'done', tab });
      return;
    }
    await sleep(2000);
  }
  if (!signal.aborted) emit({ step: 'failed', message: 'The shop could not finish. Nothing was changed on your side; ask them to try again.' });
}

export type PurchaseReview = { ok: true; tab: Tab; shopName: string | null } | { ok: false; reason: string };

/** Before signing a purchase: is it for me, and do I have a tab at that shop? */
export async function reviewPurchase(kp: Keypair, offer: BuyOffer): Promise<PurchaseReview> {
  const me = kp.publicKey();
  if (offer.customer !== me) return { ok: false, reason: 'This code is for a different Fiado account than the one on this device.' };
  const tab = (await loadTabs(me)).find((t) => t.shop === offer.shop);
  if (!tab) return { ok: false, reason: 'You do not have a tab at this shop yet. Ask them for a join code first.' };
  return { ok: true, tab, shopName: tab.shopName };
}

/** The customer builds the purchase from the terms on screen, signs it, and sends it back to the shop. */
export async function signPurchase(kp: Keypair, offer: BuyOffer, id: string): Promise<void> {
  const inner = buyOnCredit({
    customer: await server.loadAccount(kp.publicKey()),
    shop: offer.shop,
    amount: offer.amount,
    note: { item: offer.item, due: offer.due },
  });
  inner.sign(kp);
  await writeSlot(id, 'response', { xdr: xdrOf(inner) });
}
