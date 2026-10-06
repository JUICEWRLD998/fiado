// Template verification: "a key only signs what it can read".
//
// Each phone rebuilds, from the plain-language terms on its own screen, the transaction it expects, and
// compares it to the one it received: same source, same operations byte for byte, same memo, a sane fee,
// a short expiry, and the right signatures. Anything extra, missing or altered is a mismatch, so a
// hostile counterpart or a hostile mailbox cannot slip an operation past the person about to sign.

import { Account, FeeBumpTransaction, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { signedBy } from '../book/export';
import { buyOnCredit, joinAndOpen, openCredit } from '../chain/builders';
import { NETWORK_PASSPHRASE } from '../chain/config';
import type { PurchaseNote } from '../chain/memo';

/** Ten times the network minimum per operation. Nothing we build comes near it. */
export const MAX_FEE_PER_OP = 1000n;
/** A transaction handed between two phones may be valid for 15 minutes at most. */
export const MAX_WINDOW_S = 900;

export type Verified = { ok: true; tx: Transaction; hash: string } | { ok: false; reason: string };
export type VerifyOptions = {
  /** Accounts whose signature must already be on the transaction. */
  requireSigned: string[];
  /** Unix seconds. Injected so tests control the clock. */
  now?: number;
};

const fail = (reason: string): Verified => ({ ok: false, reason });
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function memoText(tx: Transaction): string {
  if (tx.memo.type === 'none') return '';
  if (tx.memo.type === 'text') return new TextDecoder().decode(tx.memo.value as Uint8Array);
  return `#${tx.memo.type}`;
}

function opsXdr(tx: Transaction): string[] {
  const env = tx.toEnvelope();
  // A Transaction we parsed is always a v1 envelope; narrow the union rather than cast.
  if (env.type !== 'envelopeTypeTx') throw new Error(`unexpected envelope type ${env.type}`);
  return env.v1.tx.operations.map((o) => o.toXDR('base64'));
}

function prepare(xdr: string): { tx: Transaction; seqBefore: string } | string {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  } catch {
    return 'This is not a valid transaction.';
  }
  if (parsed instanceof FeeBumpTransaction) return 'A fee-bump envelope is not expected here.';
  const seq = BigInt(parsed.sequence);
  if (seq < 1n) return 'The sequence number is invalid.';
  return { tx: parsed, seqBefore: (seq - 1n).toString() };
}

function compare(received: Transaction, expected: Transaction, o: VerifyOptions): Verified {
  if (received.source !== expected.source) return fail('The transaction is for a different account than agreed.');

  const a = opsXdr(received);
  const b = opsXdr(expected);
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) return fail('The operations are not exactly what was agreed. Do not sign.');

  if (memoText(received) !== memoText(expected)) return fail('The note on the transaction is not what was agreed.');

  if (BigInt(received.fee) > BigInt(a.length) * MAX_FEE_PER_OP) return fail('The fee is higher than allowed.');

  const now = o.now ?? Math.floor(Date.now() / 1000);
  const tb = received.timeBounds;
  if (!tb || !tb.maxTime || tb.maxTime === '0') return fail('The transaction never expires.');
  if (Number(tb.maxTime) < now) return fail('The transaction has expired. Ask for a new one.');
  if (Number(tb.maxTime) > now + MAX_WINDOW_S) return fail('The transaction stays valid for too long.');
  if (Number(tb.minTime || 0) > now) return fail('The transaction is not valid yet.');

  for (const key of o.requireSigned) {
    if (!signedBy(key, received.hash(), received.signatures)) return fail(`A required signature is missing or invalid (${key.slice(0, 6)}…${key.slice(-4)}).`);
  }
  return { ok: true, tx: received, hash: toHex(received.hash()) };
}

export type JoinExpect = {
  shop: string;
  customer: string;
  limit: string;
  /** Used only when the customer's account does not exist yet. */
  name: string;
  /** True when the customer already has an account, so the shop only opens a line. */
  existing: boolean;
};

/** The shop builds the join; the customer verifies it before signing, and the shop verifies it again before submitting. */
export function verifyJoin(xdr: string, expect: JoinExpect, o: VerifyOptions): Verified {
  const p = prepare(xdr);
  if (typeof p === 'string') return fail(p);
  let expected: Transaction;
  try {
    const shop = new Account(expect.shop, p.seqBefore);
    expected = expect.existing
      ? openCredit({ shop, customer: expect.customer, limit: expect.limit })
      : joinAndOpen({ shop, customer: expect.customer, limit: expect.limit, name: expect.name });
  } catch (e) {
    return fail(`The agreed terms are not valid: ${(e as Error).message}`);
  }
  return compare(p.tx, expected, o);
}

export type PurchaseExpect = { shop: string; customer: string; amount: string; note: PurchaseNote };

/** The customer builds and signs the purchase; the shop verifies it before wrapping it in a fee bump. */
export function verifyPurchase(xdr: string, expect: PurchaseExpect, o: VerifyOptions): Verified {
  const p = prepare(xdr);
  if (typeof p === 'string') return fail(p);
  let expected: Transaction;
  try {
    expected = buyOnCredit({ customer: new Account(expect.customer, p.seqBefore), shop: expect.shop, amount: expect.amount, note: expect.note });
  } catch (e) {
    return fail(`The agreed terms are not valid: ${(e as Error).message}`);
  }
  return compare(p.tx, expected, o);
}
