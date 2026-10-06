import { describe, expect, it } from 'vitest';
import { book } from './book';
import { fixture, mv, S } from './fixture.test-helpers';
import { toCustomerInfo, toLines, toMovements, type CustomerInfo, type Line } from './movements';

const { shopA, shopB, customer, rogue } = fixture.accounts;
const customers = {
  [customer]: toCustomerInfo(fixture.accounts_raw.customer),
  [rogue]: toCustomerInfo(fixture.accounts_raw.rogue),
};

describe('book: shop A in the real fixture', () => {
  const run = (today: string) =>
    book({ shop: shopA, movements: toMovements(fixture.payments.shopA), lines: toLines(fixture.accounts_raw.shopA.balances), customers, today });

  it('shows Bisi and refuses to show the rogue FIADO issuer as a customer', () => {
    const b = run('2026-10-06');
    expect(b.rows.map((r) => r.name)).toEqual(['Bisi']);
    expect(b.ignored).toEqual([rogue]);
  });

  it('reports what the network holds: owed, limit and headroom', () => {
    const [row] = run('2026-10-06').rows;
    expect(row).toMatchObject({ owed: S(1700), limit: S(5000), headroom: S(3300), authorized: true });
  });

  it('pays oldest first: the cash clears Rice, the write-off and transfer eat into Oil, Bread is untouched', () => {
    const [row] = run('2026-10-06').rows;
    expect(row?.openItems.map((i) => [i.item, i.remaining, i.due])).toEqual([
      ['Oil 5L', S(700), '2026-10-20'],
      ['Bread', S(1000), '2026-11-01'],
    ]);
    expect(row?.oldestUnpaid?.item).toBe('Oil 5L');
  });

  it('explains the balance: the movements add up to exactly what the trustline holds', () => {
    expect(run('2026-10-06').rows[0]?.explained).toBe(true);
    expect(fixture.expect.shopA.owed).toBe('1700');
  });

  it('flags overdue only once the oldest due date has passed', () => {
    expect(run('2026-10-06').rows[0]).toMatchObject({ overdue: false, overdueAmount: 0n });
    expect(run('2026-10-20').rows[0]).toMatchObject({ overdue: false }); // due today is not overdue
    expect(run('2026-10-21').rows[0]).toMatchObject({ overdue: true, overdueAmount: S(700) });
    expect(run('2026-11-02').rows[0]).toMatchObject({ overdue: true, overdueAmount: S(1700) });
  });
});

describe('book: shop B in the real fixture', () => {
  it('counts a debt transferred in from another shop as an open item', () => {
    const b = book({
      shop: shopB,
      movements: toMovements(fixture.payments.shopB),
      lines: toLines(fixture.accounts_raw.shopB.balances),
      customers,
      today: '2026-10-06',
    });
    const [row] = b.rows;
    expect(row).toMatchObject({ owed: S(500), explained: true });
    expect(row?.openItems.map((i) => [i.item, i.remaining, i.fromTransfer])).toEqual([
      ['Beans', S(400), false],
      ['Transferred from another shop', S(100), true],
    ]);
  });
});

describe('book: edge cases', () => {
  const C = 'C1';
  const SHOP = 'SHOP';
  const info: CustomerInfo = { name: 'Ada', authRequired: true };
  const line = (owed: number, limit = 1000): Line => ({ customer: C, owed: S(owed), limit: S(limit), authorized: true });

  it('marks a row unexplained when the feed does not add up to the balance (a truncated feed)', () => {
    const b = book({
      shop: SHOP,
      movements: [mv({ customer: C, from: SHOP, to: C, amount: 100, at: '2026-10-01T10:00:00Z', memo: 'cash' })],
      lines: [line(500)],
      customers: { [C]: info },
      today: '2026-10-06',
    });
    expect(b.rows[0]?.explained).toBe(false);
    expect(b.rows[0]?.owed).toBe(S(500)); // the network figure is still what we show
  });

  it('marks a row unexplained when repayments exceed every purchase we can see', () => {
    const b = book({
      shop: SHOP,
      movements: [
        mv({ customer: C, from: C, to: SHOP, amount: 100, at: '2026-10-01T10:00:00Z', memo: 'Rice' }),
        mv({ customer: C, from: SHOP, to: C, amount: 300, at: '2026-10-02T10:00:00Z', memo: 'cash' }),
      ],
      lines: [line(0)],
      customers: { [C]: info },
      today: '2026-10-06',
    });
    expect(b.rows[0]?.explained).toBe(false);
  });

  it('never lists a line whose issuer is not an AUTH_REQUIRED Fiado account', () => {
    const b = book({ shop: SHOP, movements: [], lines: [line(10)], customers: { [C]: { name: 'x', authRequired: false } }, today: '2026-10-06' });
    expect(b.rows).toEqual([]);
    expect(b.ignored).toEqual([C]);
    const unknown = book({ shop: SHOP, movements: [], lines: [line(10)], customers: {}, today: '2026-10-06' });
    expect(unknown.ignored).toEqual([C]);
  });

  it('never leaks one customer movements into another row', () => {
    const D = 'C2';
    const b = book({
      shop: SHOP,
      movements: [
        mv({ customer: C, from: C, to: SHOP, amount: 100, at: '2026-10-01T10:00:00Z', memo: 'Rice|261001' }),
        mv({ customer: D, from: D, to: SHOP, amount: 40, at: '2026-10-01T11:00:00Z', memo: 'Soap' }),
      ],
      lines: [line(100), { customer: D, owed: S(40), limit: S(1000), authorized: true }],
      customers: { [C]: info, [D]: { name: 'Bayo', authRequired: true } },
      today: '2026-10-06',
    });
    expect(b.rows.find((r) => r.customer === C)?.openItems).toHaveLength(1);
    expect(b.rows.find((r) => r.customer === D)?.openItems[0]?.item).toBe('Soap');
  });

  it('a purchase with no due date is never overdue', () => {
    const b = book({
      shop: SHOP,
      movements: [mv({ customer: C, from: C, to: SHOP, amount: 100, at: '2026-01-01T10:00:00Z', memo: 'Rice' })],
      lines: [line(100)],
      customers: { [C]: info },
      today: '2030-01-01',
    });
    expect(b.rows[0]).toMatchObject({ overdue: false, explained: true });
    expect(b.rows[0]?.openItems[0]?.due).toBeNull();
  });

  it('headroom never goes negative', () => {
    const b = book({ shop: SHOP, movements: [], lines: [line(100, 100)], customers: { [C]: info }, today: '2026-10-06' });
    expect(b.rows[0]?.headroom).toBe(0n);
  });

  it('sorts overdue first, then the biggest tab, then name', () => {
    const mk = (id: string, name: string, owed: number, due: string) => ({
      m: mv({ customer: id, from: id, to: SHOP, amount: owed, at: '2026-10-01T10:00:00Z', memo: `Item|${due}` }),
      line: { customer: id, owed: S(owed), limit: S(1000), authorized: true } as Line,
      info: { name, authRequired: true } as CustomerInfo,
    });
    const rows = [mk('X', 'Zed', 500, '261201'), mk('Y', 'Amy', 100, '261001'), mk('Z', 'Bob', 100, '261201'), mk('W', 'Cat', 100, '261201')];
    const b = book({
      shop: SHOP,
      movements: rows.map((r) => r.m),
      lines: rows.map((r) => r.line),
      customers: Object.fromEntries(rows.map((r) => [r.line.customer, r.info])),
      today: '2026-10-06',
    });
    expect(b.rows.map((r) => r.name)).toEqual(['Amy', 'Zed', 'Bob', 'Cat']); // Amy overdue; then 500; then 100s by name
  });

  it('ignores a line whose issuer is the shop itself', () => {
    const b = book({ shop: SHOP, movements: [], lines: [{ ...line(1), customer: SHOP }], customers: { [SHOP]: info }, today: '2026-10-06' });
    expect(b.rows).toEqual([]);
  });
});
