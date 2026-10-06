// The handoff mailbox: how a shop's phone and a customer's phone pass one transaction back and forth.
//
// A session is created by the shop and holds up to four write-once slots, each living 10 minutes:
//
//   join flow : offer (shop) -> hello (customer: who I am) -> request (shop: the tx to sign) -> response (customer: signed tx)
//   buy flow  : offer (shop: what is being bought)          -> response (customer: signed purchase)
//
// The mailbox holds no secrets and is not trusted: every client re-verifies what it receives
// (see verify.ts), and nothing in a slot can move money without the matching private key.

import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toAmount } from '../chain/amount';
import { NETWORK_PASSPHRASE } from '../chain/config';
import { encodeNote } from '../chain/memo';
import { cleanCurrency, cleanName } from '../chain/profile';
import type { Store } from './store';

export const TTL_SECONDS = 600;
export const SLOTS = ['offer', 'hello', 'request', 'response'] as const;
export type Slot = (typeof SLOTS)[number];
export const MAX_SLOT_BYTES = 8192;

export type JoinOffer = { kind: 'join'; shop: string; shopName: string; currency: string; limit: string };
export type BuyOffer = { kind: 'buy'; shop: string; customer: string; amount: string; item: string; due?: string; currency: string };
export type Offer = JoinOffer | BuyOffer;
export type Hello = { pub: string; name: string };
export type XdrSlot = { xdr: string };

export type SessionView = {
  offer: Offer;
  hello: Hello | null;
  request: XdrSlot | null;
  response: XdrSlot | null;
};

export type PutStatus = 'ok' | 'exists' | 'no_session' | 'too_big' | 'invalid' | 'out_of_order';
export type PutResult = { status: PutStatus; error?: string };

export const isSlot = (s: string): s is Slot => (SLOTS as readonly string[]).includes(s);
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const G_RE = /^G[A-Z2-7]{55}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isId = (id: string) => ID_RE.test(id);

/** 128 random bits as 22 url-safe characters. Unguessable, so the id is the capability. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const key = (id: string, slot: Slot) => `fiado:h:${id}:${slot}`;

class Reject extends Error {}
const need = (cond: boolean, message: string) => {
  if (!cond) throw new Reject(message);
};

const asObject = (body: unknown): Record<string, unknown> => {
  need(typeof body === 'object' && body !== null && !Array.isArray(body), 'body must be a JSON object');
  return body as Record<string, unknown>;
};
const str = (v: unknown, field: string): string => {
  need(typeof v === 'string', `${field} must be text`);
  return v as string;
};
const address = (v: unknown, field: string): string => {
  const s = str(v, field);
  need(G_RE.test(s), `${field} must be a Stellar address`);
  return s;
};

/** Keeps only the fields we know, normalised. Anything else the sender included is dropped. */
export function sanitize(slot: Slot, body: unknown): Offer | Hello | XdrSlot {
  const b = asObject(body);
  switch (slot) {
    case 'offer': {
      need(b.kind === 'join' || b.kind === 'buy', 'offer.kind must be "join" or "buy"');
      const shop = address(b.shop, 'offer.shop');
      const currency = cleanCurrency(str(b.currency, 'offer.currency'));
      if (b.kind === 'join') {
        return { kind: 'join', shop, shopName: cleanName(str(b.shopName, 'offer.shopName')), currency, limit: toAmount(str(b.limit, 'offer.limit')) };
      }
      const due = b.due === undefined || b.due === '' ? undefined : str(b.due, 'offer.due');
      if (due !== undefined) need(DATE_RE.test(due), 'offer.due must be YYYY-MM-DD');
      const item = str(b.item, 'offer.item');
      encodeNote({ item, due }); // throws if the item and date cannot fit the 28-byte memo
      return {
        kind: 'buy',
        shop,
        customer: address(b.customer, 'offer.customer'),
        amount: toAmount(str(b.amount, 'offer.amount')),
        item: item.trim(),
        ...(due ? { due } : {}),
        currency,
      };
    }
    case 'hello':
      return { pub: address(b.pub, 'hello.pub'), name: cleanName(str(b.name, 'hello.name')) };
    case 'request':
    case 'response': {
      const xdr = str(b.xdr, `${slot}.xdr`);
      need(xdr.length <= MAX_SLOT_BYTES && /^[A-Za-z0-9+/=]+$/.test(xdr), `${slot}.xdr is not base64`);
      try {
        TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
      } catch {
        throw new Reject(`${slot}.xdr is not a valid transaction envelope`);
      }
      return { xdr };
    }
  }
}

/** Starts a session from the shop's offer. Returns the session id, or why the offer was refused. */
export async function createSession(store: Store, body: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let offer: Offer;
  try {
    offer = sanitize('offer', body) as Offer;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const id = newId();
  if (!(await store.setIfAbsent(key(id, 'offer'), JSON.stringify(offer), TTL_SECONDS))) return { ok: false, error: 'could not allocate a session, try again' };
  return { ok: true, id };
}

const parse = <T>(raw: string | null): T | null => (raw === null ? null : (JSON.parse(raw) as T));

export async function getSession(store: Store, id: string): Promise<SessionView | null> {
  if (!isId(id)) return null;
  const offer = parse<Offer>(await store.get(key(id, 'offer')));
  if (!offer) return null;
  const [hello, request, response] = await Promise.all([
    store.get(key(id, 'hello')),
    store.get(key(id, 'request')),
    store.get(key(id, 'response')),
  ]);
  return { offer, hello: parse<Hello>(hello), request: parse<XdrSlot>(request), response: parse<XdrSlot>(response) };
}

/** Writes one slot, once. The order of the flow is enforced so a stray write cannot confuse a session. */
export async function putSlot(store: Store, id: string, slot: Slot, body: unknown): Promise<PutResult> {
  if (!isId(id)) return { status: 'no_session', error: 'unknown session' };
  if (slot === 'offer') return { status: 'invalid', error: 'the offer is set when the session is created' };
  if (JSON.stringify(body ?? null).length > MAX_SLOT_BYTES) return { status: 'too_big', error: `slot is larger than ${MAX_SLOT_BYTES} bytes` };

  const offer = parse<Offer>(await store.get(key(id, 'offer')));
  if (!offer) return { status: 'no_session', error: 'unknown or expired session' };

  if (offer.kind === 'buy' && slot !== 'response') return { status: 'out_of_order', error: `a purchase session takes only a response, not "${slot}"` };
  if (offer.kind === 'join' && slot === 'request' && (await store.get(key(id, 'hello'))) === null) {
    return { status: 'out_of_order', error: 'request needs the customer hello first' };
  }
  if (offer.kind === 'join' && slot === 'response' && (await store.get(key(id, 'request'))) === null) {
    return { status: 'out_of_order', error: 'response needs the shop request first' };
  }

  let clean: Hello | XdrSlot;
  try {
    clean = sanitize(slot, body) as Hello | XdrSlot;
  } catch (e) {
    return { status: 'invalid', error: (e as Error).message };
  }
  if (slot === 'hello' && (clean as Hello).pub === offer.shop) return { status: 'invalid', error: 'the shop cannot join its own book' };

  const wrote = await store.setIfAbsent(key(id, slot), JSON.stringify(clean), TTL_SECONDS);
  return wrote ? { status: 'ok' } : { status: 'exists', error: `${slot} was already written` };
}
