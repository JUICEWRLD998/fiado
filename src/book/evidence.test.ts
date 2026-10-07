import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evidence, isLineFull } from './evidence';
import type { RawPayment } from './movements';

// A real shop feed from the Stellar test network, captured with include_failed=true. It holds two purchases and one
// purchase the network refused for being over the limit (transaction d04d5789...).
const feed = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/fixtures/refusal-feed.json', import.meta.url)), 'utf8')) as {
  shop: string;
  payments: RawPayment[];
};
const REFUSED = 'd04d57899f3ea8e5aae1b14026c1d7c3a6a643bb8e3def11f05a83c14059c3db';
const failed = feed.payments.find((p) => p.transaction_hash === REFUSED)!;
const okXdr = feed.payments.find((p) => p.type === 'payment' && p.transaction_successful)!.transaction!.result_xdr!;

describe('isLineFull', () => {
  it('recognises the real refused transaction (planted positive control)', () => {
    expect(isLineFull(failed.transaction?.result_xdr)).toBe(true);
  });
  it('is false for a successful result, for nothing, and for garbage', () => {
    expect(isLineFull(okXdr)).toBe(false);
    expect(isLineFull(undefined)).toBe(false);
    expect(isLineFull('not xdr')).toBe(false);
  });
});

describe('evidence from a real shop feed', () => {
  const e = evidence(feed.shop, feed.payments);
  it('counts what the ledger shows, and the refusal', () => {
    expect(e).toMatchObject({ customers: 2, purchases: 2, repayments: 0, writeOffs: 0, refusals: 1 });
  });
  it('dates run from the first to the last thing counted', () => {
    expect(e.first && e.last && e.first <= e.last).toBe(true);
  });
  it('an empty feed is all zeros with no dates', () => {
    expect(evidence(feed.shop, [])).toEqual({ customers: 0, purchases: 0, repayments: 0, writeOffs: 0, refusals: 0, first: null, last: null });
  });
});

describe('what is NOT a refusal', () => {
  const only = (p: RawPayment[]) => evidence(feed.shop, p).refusals;
  it('a failed payment for another reason', () => {
    expect(only([{ ...failed, transaction: { ...failed.transaction, result_xdr: okXdr } }])).toBe(0);
  });
  it('a failed payment that was not the customer paying this shop', () => {
    expect(only([{ ...failed, to: 'GDXVDM5AEINH2DODR5SRVQHGEIFHRDN3GIEOR6UOCIUPJBL6CGSW4HJP' }])).toBe(0);
    expect(only([{ ...failed, from: feed.shop }])).toBe(0);
  });
  it('a look-alike asset code', () => {
    expect(only([{ ...failed, asset_code: 'FIADOX' }])).toBe(0);
  });
  it('the same refused transaction seen twice counts once', () => {
    expect(only([failed, { ...failed, id: `${failed.id}9` }])).toBe(1);
  });
});
