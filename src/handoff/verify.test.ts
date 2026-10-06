import { Account, Asset, Keypair, Memo, Operation, TransactionBuilder, TimeoutInfinite, type FeeBumpTransaction, type Transaction, type xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { buyOnCredit, feeBump, fiadoOf, joinAndOpen, openCredit } from '../chain/builders';
import { NETWORK_PASSPHRASE } from '../chain/config';
import { MAX_WINDOW_S, verifyJoin, verifyPurchase, type JoinExpect, type PurchaseExpect } from './verify';

const shop = Keypair.random();
const cust = Keypair.random();
const other = Keypair.random();
const rogue = Keypair.random();
const SHOP = shop.publicKey();
const CUST = cust.publicKey();
const nowS = () => Math.floor(Date.now() / 1000);
const xdrOf = (t: Transaction | FeeBumpTransaction) => t.toEnvelope().toXDR('base64');

function opsOf(t: Transaction): xdr.Operation[] {
  const e = t.toEnvelope();
  if (e.type !== 'envelopeTypeTx') throw new Error('not a v1 envelope');
  return e.v1.tx.operations;
}

/** Build a transaction by hand, the way a hostile counterpart could. `maxTime: null` means no expiry. */
function craft(p: { source: string; ops: xdr.Operation[]; memo?: string; fee?: string; maxTime?: number | null; signers: Keypair[] }): string {
  const b = new TransactionBuilder(new Account(p.source, '99'), { fee: p.fee ?? '100', networkPassphrase: NETWORK_PASSPHRASE });
  if (p.maxTime === null) b.setTimeout(TimeoutInfinite);
  else b.setTimebounds(0, p.maxTime ?? nowS() + 300);
  if (p.memo !== undefined) b.addMemo(Memo.text(p.memo));
  p.ops.forEach((o) => b.addOperation(o));
  const t = b.build();
  t.sign(...p.signers);
  return xdrOf(t);
}

// ---------------------------------------------------------------- purchase (the shop verifies what the customer signed)
const buyExpect: PurchaseExpect = { shop: SHOP, customer: CUST, amount: '3200', note: { item: 'Rice 2 bags', due: '2026-10-20' } };
const MEMO = 'Rice 2 bags|261020';
const pay = (o: { destination?: string; asset?: Asset; amount?: string; source?: string } = {}) =>
  Operation.payment({ destination: o.destination ?? SHOP, asset: o.asset ?? fiadoOf(CUST), amount: o.amount ?? '3200', ...(o.source ? { source: o.source } : {}) });
const opts = { requireSigned: [CUST] };

function honestBuy(signers: Keypair[] = [cust]) {
  const t = buyOnCredit({ customer: new Account(CUST, '99'), shop: SHOP, amount: '3200', note: buyExpect.note });
  t.sign(...signers);
  return t;
}

describe('verifyPurchase', () => {
  it('accepts exactly what was agreed, and reports the transaction hash', () => {
    const t = honestBuy();
    const r = verifyPurchase(xdrOf(t), buyExpect, opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hash).toBe(Array.from(t.hash(), (b) => b.toString(16).padStart(2, '0')).join(''));
  });

  it('control: a hand-crafted transaction identical to the honest one is also accepted', () => {
    expect(verifyPurchase(craft({ source: CUST, ops: [pay()], memo: MEMO, signers: [cust] }), buyExpect, opts).ok).toBe(true);
  });

  it('accepts an amount written differently but equal (3200.00 and 3200)', () => {
    expect(verifyPurchase(xdrOf(honestBuy()), { ...buyExpect, amount: '3200.00' }, opts).ok).toBe(true);
  });

  const hostile: [string, () => string][] = [
    ['an extra payment appended', () => craft({ source: CUST, ops: [pay(), pay()], memo: MEMO, signers: [cust] })],
    ['an extra setOptions that would hand the shop a signer on the customer account', () =>
      craft({ source: CUST, ops: [pay(), Operation.setOptions({ signer: { ed25519PublicKey: SHOP, weight: 255 } })], memo: MEMO, signers: [cust] })],
    ['the operation removed', () => craft({ source: CUST, ops: [], memo: MEMO, signers: [cust] })],
    ['a larger amount', () => craft({ source: CUST, ops: [pay({ amount: '3200.0000001' })], memo: MEMO, signers: [cust] })],
    ['a different destination', () => craft({ source: CUST, ops: [pay({ destination: other.publicKey() })], memo: MEMO, signers: [cust] })],
    ['the asset issued by someone else (a look-alike FIADO)', () => craft({ source: CUST, ops: [pay({ asset: fiadoOf(rogue.publicKey()) })], memo: MEMO, signers: [cust] })],
    ['a different asset code', () => craft({ source: CUST, ops: [pay({ asset: new Asset('TUSD', CUST) })], memo: MEMO, signers: [cust] })],
    ['the payment sourced from another account', () => craft({ source: CUST, ops: [pay({ source: other.publicKey() })], memo: MEMO, signers: [cust, other] })],
    ['a different memo', () => craft({ source: CUST, ops: [pay()], memo: 'Rice 3 bags|261020', signers: [cust] })],
    ['no memo at all', () => craft({ source: CUST, ops: [pay()], signers: [cust] })],
    ['a different source account', () => craft({ source: other.publicKey(), ops: [pay()], memo: MEMO, signers: [other] })],
    // Operations and memo are identical and the customer DID sign: only the source check can catch this one.
    ['a different source account even when the customer also signs', () => craft({ source: other.publicKey(), ops: [pay()], memo: MEMO, signers: [other, cust] })],
    ['a fee far above the cap', () => craft({ source: CUST, ops: [pay()], memo: MEMO, fee: '5000000', signers: [cust] })],
    ['no expiry', () => craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: null, signers: [cust] })],
    ['an expiry far in the future', () => craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: nowS() + MAX_WINDOW_S + 600, signers: [cust] })],
    ['an expiry already in the past', () => craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: nowS() - 10, signers: [cust] })],
    ['no signature from the customer', () => craft({ source: CUST, ops: [pay()], memo: MEMO, signers: [] })],
    ['a signature from the wrong key', () => craft({ source: CUST, ops: [pay()], memo: MEMO, signers: [other] })],
    ['the shop signing instead of the customer', () => craft({ source: CUST, ops: [pay()], memo: MEMO, signers: [shop] })],
    ['a fee-bump envelope instead of a plain transaction', () => xdrOf(feeBump(honestBuy(), SHOP))],
    ['garbage', () => 'AAAAnot-an-envelope'],
    ['an empty string', () => ''],
  ];
  for (const [name, make] of hostile) {
    it(`rejects ${name}`, () => {
      const r = verifyPurchase(make(), buyExpect, opts);
      expect(r.ok, name).toBe(false);
    });
  }

  it('explains each time-related refusal in its own words (so a person knows what to do)', () => {
    const reason = (x: string) => {
      const r = verifyPurchase(x, buyExpect, opts);
      return r.ok ? 'ACCEPTED' : r.reason;
    };
    expect(reason(craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: null, signers: [cust] }))).toMatch(/never expires/);
    expect(reason(craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: nowS() - 10, signers: [cust] }))).toMatch(/expired/);
    expect(reason(craft({ source: CUST, ops: [pay()], memo: MEMO, maxTime: nowS() + MAX_WINDOW_S + 600, signers: [cust] }))).toMatch(/too long/);
    expect(reason(craft({ source: other.publicKey(), ops: [pay()], memo: MEMO, signers: [other, cust] }))).toMatch(/different account/);
  });

  it('rejects an honest transaction once its expiry has passed (clock advanced)', () => {
    expect(verifyPurchase(xdrOf(honestBuy()), buyExpect, { ...opts, now: nowS() + 400 }).ok).toBe(false);
  });

  it('rejects when the expected terms differ from what was signed (different amount, item or customer)', () => {
    const x = xdrOf(honestBuy());
    expect(verifyPurchase(x, { ...buyExpect, amount: '3201' }, opts).ok).toBe(false);
    expect(verifyPurchase(x, { ...buyExpect, note: { item: 'Rice 2 bags', due: '2026-10-21' } }, opts).ok).toBe(false);
    expect(verifyPurchase(x, { ...buyExpect, customer: other.publicKey() }, opts).ok).toBe(false);
    expect(verifyPurchase(x, { ...buyExpect, shop: other.publicKey() }, opts).ok).toBe(false);
  });

  it('refuses terms it cannot even build (zero amount) instead of throwing', () => {
    const r = verifyPurchase(xdrOf(honestBuy()), { ...buyExpect, amount: '0' }, opts);
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------- join (the customer verifies what the shop built)
const joinExpect: JoinExpect = { shop: SHOP, customer: CUST, limit: '10000', name: 'Bisi', existing: false };

function honestJoin(signers: Keypair[] = [shop]) {
  const t = joinAndOpen({ shop: new Account(SHOP, '99'), customer: CUST, limit: '10000', name: 'Bisi' });
  t.sign(...signers);
  return t;
}
const joinOpts = { requireSigned: [SHOP] };

describe('verifyJoin', () => {
  it('accepts the join the customer was promised', () => {
    expect(verifyJoin(xdrOf(honestJoin()), joinExpect, joinOpts).ok).toBe(true);
  });

  it('the shop re-verifies the customer-signed version, now requiring both signatures', () => {
    const both = honestJoin([shop, cust]);
    expect(verifyJoin(xdrOf(both), joinExpect, { requireSigned: [SHOP, CUST] }).ok).toBe(true);
    expect(verifyJoin(xdrOf(honestJoin([shop])), joinExpect, { requireSigned: [SHOP, CUST] }).ok).toBe(false);
  });

  it('for a customer who already has an account, expects only a credit line to be opened', () => {
    const t = openCredit({ shop: new Account(SHOP, '99'), customer: CUST, limit: '10000' });
    t.sign(shop);
    expect(verifyJoin(xdrOf(t), { ...joinExpect, existing: true }, joinOpts).ok).toBe(true);
    // the two shapes are not interchangeable
    expect(verifyJoin(xdrOf(t), { ...joinExpect, existing: false }, joinOpts).ok).toBe(false);
    expect(verifyJoin(xdrOf(honestJoin()), { ...joinExpect, existing: true }, joinOpts).ok).toBe(false);
  });

  it('rejects terms that differ from what the customer was shown: limit, name, customer, shop', () => {
    const x = xdrOf(honestJoin());
    expect(verifyJoin(x, { ...joinExpect, limit: '10001' }, joinOpts).ok).toBe(false);
    expect(verifyJoin(x, { ...joinExpect, name: 'Bisi O' }, joinOpts).ok).toBe(false);
    expect(verifyJoin(x, { ...joinExpect, customer: other.publicKey() }, joinOpts).ok).toBe(false);
    expect(verifyJoin(x, { ...joinExpect, shop: other.publicKey() }, joinOpts).ok).toBe(false);
  });

  it('rejects a shop that appends an operation to take over the customer account', () => {
    const base = honestJoin();
    const takeover = Operation.setOptions({ source: CUST, signer: { ed25519PublicKey: SHOP, weight: 255 } });
    const x = craft({ source: SHOP, ops: [...opsOf(base), takeover], fee: '100', signers: [shop] });
    expect(verifyJoin(x, joinExpect, joinOpts).ok).toBe(false);
  });

  it('control: the same hand-crafted transaction WITHOUT the extra operation is accepted', () => {
    const x = craft({ source: SHOP, ops: opsOf(honestJoin()), signers: [shop] });
    expect(verifyJoin(x, joinExpect, joinOpts).ok).toBe(true);
  });

  it('rejects a join sourced from another account, even with the same operations and the shop signing too', () => {
    const x = craft({ source: other.publicKey(), ops: opsOf(honestJoin()), signers: [other, shop] });
    expect(verifyJoin(x, joinExpect, joinOpts).ok).toBe(false);
  });

  it('rejects a join with an operation removed (the customer would never be authorized)', () => {
    const ops = opsOf(honestJoin());
    expect(verifyJoin(craft({ source: SHOP, ops: ops.slice(0, -1), signers: [shop] }), joinExpect, joinOpts).ok).toBe(false);
  });

  it('rejects a join with a higher limit smuggled into the trustline operation', () => {
    const t = joinAndOpen({ shop: new Account(SHOP, '99'), customer: CUST, limit: '99999', name: 'Bisi' });
    t.sign(shop);
    expect(verifyJoin(xdrOf(t), joinExpect, joinOpts).ok).toBe(false);
  });

  it('rejects an unsigned join, an expired join, a join with no expiry and a fee-bump', () => {
    expect(verifyJoin(xdrOf(honestJoin([])), joinExpect, joinOpts).ok).toBe(false);
    expect(verifyJoin(xdrOf(honestJoin()), joinExpect, { ...joinOpts, now: nowS() + 400 }).ok).toBe(false);
    expect(verifyJoin(craft({ source: SHOP, ops: opsOf(honestJoin()), maxTime: null, signers: [shop] }), joinExpect, joinOpts).ok).toBe(false);
    expect(verifyJoin(xdrOf(feeBump(honestBuy(), SHOP)), joinExpect, joinOpts).ok).toBe(false);
  });

  it('rejects an expected name it cannot build instead of throwing', () => {
    expect(verifyJoin(xdrOf(honestJoin()), { ...joinExpect, name: '' }, joinOpts).ok).toBe(false);
  });
});
