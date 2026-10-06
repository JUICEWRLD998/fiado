import { describe, expect, it } from 'vitest';
import { fixture, S } from './fixture.test-helpers';
import { kindForShop, todayUtc, toCustomerInfo, toLines, toMovements, type RawPayment } from './movements';

const { shopA, shopB, customer, rogue } = fixture.accounts;

describe('toMovements (real Horizon feed)', () => {
  const a = toMovements(fixture.payments.shopA);

  it('keeps only FIADO payments: the create_account records are dropped', () => {
    expect(fixture.payments.shopA.length).toBeGreaterThan(a.length);
    expect(a).toHaveLength(7); // 3 purchases, cash, write-off, transfer, and the rogue payment
  });

  it('reads memos from the joined transaction and amounts as exact stroops', () => {
    const purchases = a.filter((m) => m.customer === customer && m.from === customer);
    expect(purchases.map((m) => m.memo)).toEqual(['Rice 2 bags|261005', 'Oil 5L|261020', 'Bread|261101']);
    expect(purchases.map((m) => m.amount)).toEqual([S(2000), S(1500), S(1000)]);
    expect(a.find((m) => m.memo === 'forgiven')?.amount).toBe(S(200));
    expect(a.find((m) => m.to === shopB)?.memo).toBe(''); // the transfer carries no memo
  });

  it('keeps ledger order and de-duplicates a payment that appears in two shops feeds', () => {
    const both = toMovements([...fixture.payments.shopA, ...fixture.payments.shopB]);
    expect(both).toHaveLength(9); // 7 + 3 - the shared transfer
    const ids = both.map((m) => BigInt(m.id));
    expect(ids).toEqual([...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it('remembers the issuer on every movement, so a spoofed FIADO is never confused with a real one', () => {
    const spoof = a.filter((m) => m.customer === rogue);
    expect(spoof).toHaveLength(1);
    expect(spoof[0]?.from).toBe(rogue);
    expect(spoof[0]?.customer).not.toBe(customer);
  });

  it('drops failed transactions (planted control: the same feed with one marked failed)', () => {
    const failed: RawPayment[] = fixture.payments.shopA.map((p, i) => (i === 3 ? { ...p, transaction_successful: false } : p));
    const before = toMovements(fixture.payments.shopA).length;
    const afterCount = toMovements(failed).length;
    expect(fixture.payments.shopA[3]?.type).toBe('payment');
    expect(afterCount).toBe(before - 1);
  });
});

describe('kindForShop', () => {
  const a = toMovements(fixture.payments.shopA).filter((m) => m.customer === customer);
  const b = toMovements(fixture.payments.shopB).filter((m) => m.customer === customer);

  it('reads shop A as 3 purchases, a cash repayment, a write-off and a transfer out', () => {
    expect(a.map((m) => kindForShop(m, shopA))).toEqual(['purchase', 'purchase', 'purchase', 'repay', 'forgiven', 'transfer_out']);
  });

  it('reads shop B as a purchase, a repayment and a transfer in', () => {
    expect(b.map((m) => kindForShop(m, shopB))).toEqual(['purchase', 'repay', 'transfer_in']);
  });

  it('is null for a shop that is not a party, and for the customer themselves', () => {
    expect(kindForShop(a[0]!, shopB)).toBeNull();
    expect(kindForShop(a[0]!, customer)).toBeNull();
  });

  it('adds up to the fixture ground truth', () => {
    const sum = (kind: string, ms: typeof a, shop: string) => ms.filter((m) => kindForShop(m, shop) === kind).reduce((t, m) => t + m.amount, 0n);
    expect(sum('purchase', a, shopA)).toBe(S(fixture.expect.shopA.purchases));
    expect(sum('repay', a, shopA)).toBe(S(fixture.expect.shopA.repaid));
    expect(sum('forgiven', a, shopA)).toBe(S(fixture.expect.shopA.forgiven));
    expect(sum('transfer_out', a, shopA)).toBe(S(fixture.expect.shopA.transferredOut));
    expect(sum('purchase', b, shopB)).toBe(S(fixture.expect.shopB.purchases));
    expect(sum('transfer_in', b, shopB)).toBe(S(fixture.expect.shopB.transferredIn));
  });
});

describe('toLines and toCustomerInfo', () => {
  it('reads the shop trustlines, including an unlimited one, without float error', () => {
    const lines = toLines(fixture.accounts_raw.shopA.balances);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.customer === customer)).toEqual({ customer, owed: S(1700), limit: S(5000), authorized: true });
    expect(lines.find((l) => l.customer === rogue)?.limit).toBe(9223372036854775807n);
  });

  it('tells a Fiado customer account (AUTH_REQUIRED, named) from a rogue issuer', () => {
    expect(toCustomerInfo(fixture.accounts_raw.customer)).toEqual({ name: 'Bisi', authRequired: true });
    expect(toCustomerInfo(fixture.accounts_raw.rogue)).toEqual({ name: null, authRequired: false });
  });
});

describe('todayUtc', () => {
  it('formats the UTC date, not the local one', () => {
    expect(todayUtc(new Date('2026-10-06T23:30:00Z'))).toBe('2026-10-06');
    expect(todayUtc(new Date('2026-10-07T00:00:00Z'))).toBe('2026-10-07');
  });
});
