// The customer's portable record: facts about how one customer has used credit, across shops.
// Pure and deterministic. It is deliberately NOT a score: a handful of counts and a median that a
// new shop can read and judge for itself.
//
// A customer's own feed shows purchases (they sign them) and repayments (the shop returns the IOU to
// them). It never shows a shop-to-shop debt transfer, so per-shop figures follow the customer's feed.

import { decodeNote } from '../chain/memo';
import type { Movement } from './movements';

export type ShopRecord = {
  shop: string;
  purchases: number;
  issued: bigint;
  repaid: bigint;
  forgiven: bigint;
  open: bigint;
  firstAt: string;
  lastAt: string;
};

export type RecordSummary = {
  customer: string;
  shops: number;
  purchases: number;
  issued: bigint;
  repaid: bigint;
  forgiven: bigint;
  open: bigint;
  /** Purchases the customer cleared with their own repayments. */
  settled: number;
  /** Of those, how many were cleared by the due date, and how many after it (only purchases that had a due date). */
  onTime: number;
  late: number;
  /** Median days between a purchase and the repayment that cleared it; null until one is settled. */
  medianDaysToRepay: number | null;
  /** Purchases still open whose due date has passed. */
  overdueNow: number;
  /** Purchases cleared with any write-off by the shop. They are neither on time nor late. */
  writtenOff: number;
  firstAt: string | null;
  lastAt: string | null;
  perShop: ShopRecord[];
};

type Purchase = {
  at: string;
  due: string | null;
  remaining: bigint;
  touchedByWriteOff: boolean;
  clearedAt: string | null;
};

const DAY_MS = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function record({ customer, movements, today }: { customer: string; movements: readonly Movement[]; today: string }): RecordSummary {
  // Only this customer's own asset, and only payments they are a party to.
  const mine = movements.filter((m) => m.customer === customer && (m.from === customer || m.to === customer));

  const shops = new Map<string, { purchases: Purchase[]; rec: ShopRecord }>();
  const slot = (shop: string, at: string) => {
    let s = shops.get(shop);
    if (!s) {
      s = { purchases: [], rec: { shop, purchases: 0, issued: 0n, repaid: 0n, forgiven: 0n, open: 0n, firstAt: at, lastAt: at } };
      shops.set(shop, s);
    }
    s.rec.lastAt = at;
    return s;
  };

  for (const m of mine) {
    if (m.from === customer && m.to !== customer) {
      const s = slot(m.to, m.at);
      s.purchases.push({ at: m.at, due: decodeNote(m.memo).due ?? null, remaining: m.amount, touchedByWriteOff: false, clearedAt: null });
      s.rec.purchases += 1;
      s.rec.issued += m.amount;
    } else if (m.to === customer && m.from !== customer) {
      const s = slot(m.from, m.at);
      const writeOff = m.memo === 'forgiven';
      if (writeOff) s.rec.forgiven += m.amount;
      else s.rec.repaid += m.amount;
      let left = m.amount;
      for (const p of s.purchases) {
        if (left === 0n) break;
        if (p.remaining === 0n) continue;
        const take = p.remaining < left ? p.remaining : left;
        p.remaining -= take;
        left -= take;
        if (writeOff) p.touchedByWriteOff = true;
        if (p.remaining === 0n) p.clearedAt = m.at;
      }
    }
  }

  const days: number[] = [];
  let settled = 0;
  let onTime = 0;
  let late = 0;
  let writtenOff = 0;
  let overdueNow = 0;
  let purchases = 0;
  const perShop: ShopRecord[] = [];

  for (const { purchases: ps, rec } of shops.values()) {
    rec.open = rec.issued - rec.repaid - rec.forgiven;
    perShop.push(rec);
    for (const p of ps) {
      purchases += 1;
      if (p.remaining > 0n) {
        if (p.due !== null && p.due < today) overdueNow += 1;
        continue;
      }
      if (p.touchedByWriteOff) {
        writtenOff += 1;
        continue;
      }
      settled += 1;
      days.push(Math.floor((Date.parse(p.clearedAt!) - Date.parse(p.at)) / DAY_MS));
      if (p.due !== null) {
        if (p.clearedAt!.slice(0, 10) <= p.due) onTime += 1;
        else late += 1;
      }
    }
  }

  perShop.sort((a, b) => (a.firstAt < b.firstAt ? -1 : a.firstAt > b.firstAt ? 1 : 0));
  const sum = (f: (r: ShopRecord) => bigint) => perShop.reduce((t, r) => t + f(r), 0n);
  return {
    customer,
    shops: perShop.length,
    purchases,
    issued: sum((r) => r.issued),
    repaid: sum((r) => r.repaid),
    forgiven: sum((r) => r.forgiven),
    open: sum((r) => r.open),
    settled,
    onTime,
    late,
    medianDaysToRepay: median(days),
    overdueNow,
    writtenOff,
    firstAt: mine[0]?.at ?? null,
    lastAt: mine.at(-1)?.at ?? null,
    perShop,
  };
}
