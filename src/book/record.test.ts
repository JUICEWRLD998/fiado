import { describe, expect, it } from 'vitest';
import { fixture, mv, S } from './fixture.test-helpers';
import { toMovements } from './movements';
import { record } from './record';

const { shopA, shopB, customer } = fixture.accounts;

describe('record: the customer in the real fixture', () => {
  const rec = record({ customer, movements: toMovements(fixture.payments.customer), today: '2026-10-21' });

  it('matches the ground truth recorded when the fixture was captured', () => {
    expect(rec).toMatchObject({
      shops: fixture.expect.customer.shops,
      issued: S(fixture.expect.customer.issued),
      repaid: S(fixture.expect.customer.repaid),
      forgiven: S(fixture.expect.customer.forgiven),
      open: S(fixture.expect.customer.open),
    });
  });

  it('agrees with what the two shops actually hold on the network', () => {
    expect(rec.open).toBe(S(fixture.lines.shopA.owed.replace(/\.0+$/, '')) + S(fixture.lines.shopB.owed.replace(/\.0+$/, '')));
  });

  it('splits by shop as the customer feed tells it (a shop-to-shop transfer is invisible here)', () => {
    const a = rec.perShop.find((s) => s.shop === shopA);
    const b = rec.perShop.find((s) => s.shop === shopB);
    expect(a).toMatchObject({ purchases: 3, issued: S(4500), repaid: S(2500), forgiven: S(200), open: S(1800) });
    expect(b).toMatchObject({ purchases: 1, issued: S(700), repaid: S(300), forgiven: 0n, open: S(400) });
  });

  it('counts facts: Rice is settled (late, it was due on the 5th), the rest is open, Oil is overdue', () => {
    expect(rec).toMatchObject({ purchases: 4, settled: 1, onTime: 0, late: 1, writtenOff: 0, overdueNow: 1, medianDaysToRepay: 0 });
  });

  it('ignores a rogue FIADO and the transfer when feeds from every account are merged', () => {
    const merged = toMovements([...fixture.payments.shopA, ...fixture.payments.shopB, ...fixture.payments.customer]);
    expect(record({ customer, movements: merged, today: '2026-10-21' })).toEqual(rec);
  });

  it('is facts, never a score', () => {
    expect(Object.keys(rec).some((k) => /score|rating|grade/i.test(k))).toBe(false);
  });
});

describe('record: date arithmetic (synthetic, controlled dates)', () => {
  const C = 'C';
  const SA = 'SA';
  const buy = (amount: number, at: string, memo: string, shop = SA) => mv({ customer: C, from: C, to: shop, amount, at, memo });
  const pay = (amount: number, at: string, memo = 'cash', shop = SA) => mv({ customer: C, from: shop, to: C, amount, at, memo });

  it('median days to repay: odd count takes the middle, even count averages the two middles', () => {
    const odd = record({
      customer: C,
      today: '2026-12-31',
      movements: [
        buy(10, '2026-10-01T09:00:00Z', 'a'),
        buy(10, '2026-10-01T09:00:00Z', 'b'),
        buy(10, '2026-10-01T09:00:00Z', 'c'),
        pay(10, '2026-10-03T09:00:00Z'), // a: 2 days
        pay(10, '2026-10-06T09:00:00Z'), // b: 5 days
        pay(10, '2026-10-11T09:00:00Z'), // c: 10 days
      ],
    });
    expect(odd.medianDaysToRepay).toBe(5);
    const even = record({
      customer: C,
      today: '2026-12-31',
      movements: [buy(10, '2026-10-01T09:00:00Z', 'a'), buy(10, '2026-10-01T09:00:00Z', 'b'), pay(10, '2026-10-03T09:00:00Z'), pay(10, '2026-10-08T09:00:00Z')],
    });
    expect(even.medianDaysToRepay).toBe(4.5); // (2 + 7) / 2
  });

  it('on time means cleared on or before the due date; one day later is late', () => {
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [
        buy(10, '2026-10-01T09:00:00Z', 'a|261010'),
        buy(10, '2026-10-01T09:00:00Z', 'b|261010'),
        buy(10, '2026-10-01T09:00:00Z', 'c'),
        pay(10, '2026-10-10T23:59:00Z'), // a: due day -> on time
        pay(10, '2026-10-11T00:01:00Z'), // b: next day -> late
        pay(10, '2026-10-12T09:00:00Z'), // c: no due date -> neither
      ],
    });
    expect(rec).toMatchObject({ settled: 3, onTime: 1, late: 1 });
  });

  it('one repayment can clear several purchases oldest-first, each with its own days', () => {
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [buy(10, '2026-10-01T09:00:00Z', 'a'), buy(10, '2026-10-05T09:00:00Z', 'b'), pay(20, '2026-10-09T09:00:00Z')],
    });
    expect(rec).toMatchObject({ settled: 2, medianDaysToRepay: 6 }); // 8 days and 4 days -> 6
  });

  it('a partial repayment settles nothing yet', () => {
    const rec = record({ customer: C, today: '2026-12-31', movements: [buy(100, '2026-10-01T09:00:00Z', 'a'), pay(40, '2026-10-02T09:00:00Z')] });
    expect(rec).toMatchObject({ settled: 0, open: S(60), repaid: S(40), medianDaysToRepay: null });
  });

  it('a write-off clears a purchase but is neither on time nor late, and never enters the median', () => {
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [buy(10, '2026-10-01T09:00:00Z', 'a|261010'), buy(10, '2026-10-01T09:00:00Z', 'b|261010'), pay(10, '2026-10-02T09:00:00Z', 'forgiven'), pay(10, '2026-10-03T09:00:00Z')],
    });
    expect(rec).toMatchObject({ writtenOff: 1, settled: 1, onTime: 1, late: 0, forgiven: S(10), repaid: S(10), open: 0n });
    expect(rec.medianDaysToRepay).toBe(2);
  });

  it('counts an open purchase as overdue only after its due date', () => {
    const base = { customer: C, movements: [buy(10, '2026-10-01T09:00:00Z', 'a|261010')] };
    expect(record({ ...base, today: '2026-10-10' }).overdueNow).toBe(0);
    expect(record({ ...base, today: '2026-10-11' }).overdueNow).toBe(1);
  });

  it('keeps shops apart: a repayment to one shop never clears a purchase at another', () => {
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [buy(10, '2026-10-01T09:00:00Z', 'a', 'SA'), buy(10, '2026-10-01T09:00:00Z', 'b', 'SB'), pay(10, '2026-10-02T09:00:00Z', 'cash', 'SB')],
    });
    expect(rec.perShop.map((s) => [s.shop, s.open])).toEqual([['SA', S(10)], ['SB', 0n]]);
    expect(rec.settled).toBe(1);
  });

  it('ignores another issuer asset coded FIADO, and payments the customer is not party to', () => {
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [
        buy(10, '2026-10-01T09:00:00Z', 'a'),
        mv({ customer: 'OTHER', from: 'OTHER', to: SA, amount: 999, at: '2026-10-01T09:00:00Z' }),
        mv({ customer: C, from: SA, to: 'SB', amount: 5, at: '2026-10-01T10:00:00Z' }),
      ],
    });
    expect(rec).toMatchObject({ purchases: 1, issued: S(10), open: S(10), shops: 1 });
  });

  it('ignores a look-alike FIADO from another issuer even when the customer is a party to it', () => {
    // The customer holds a rogue issuer's FIADO and pays it to a shop: customer is `from`, but the issuer is not them.
    const rec = record({
      customer: C,
      today: '2026-12-31',
      movements: [buy(10, '2026-10-01T09:00:00Z', 'a'), mv({ customer: 'ROGUE', from: C, to: SA, amount: 777, at: '2026-10-01T10:00:00Z' })],
    });
    expect(rec).toMatchObject({ purchases: 1, issued: S(10), open: S(10) });
  });

  it('an empty history is all zeros, with no median and no dates', () => {
    expect(record({ customer: C, movements: [], today: '2026-10-06' })).toMatchObject({
      shops: 0,
      purchases: 0,
      issued: 0n,
      open: 0n,
      medianDaysToRepay: null,
      firstAt: null,
      lastAt: null,
      perShop: [],
    });
  });
});
