// The shop's book: one row per customer with a credit line. Pure and deterministic.
//
// What the network holds (the trustline balance) is the truth. The movements explain it: purchases
// add to the tab, repayments and write-offs pay it off oldest-first (FIFO), and a row is marked
// `explained: false` when the movements do not add up to the balance (a truncated feed, a debt
// transfer we could not see). We never invent a number to hide that.

import { decodeNote } from '../chain/memo';
import { kindForShop, type CustomerInfo, type Line, type Movement } from './movements';

export type OpenItem = {
  hash: string;
  at: string;
  original: bigint;
  remaining: bigint;
  item: string;
  due: string | null; // YYYY-MM-DD
  fromTransfer: boolean;
};

export type BookRow = {
  customer: string;
  name: string | null;
  limit: bigint;
  owed: bigint;
  headroom: bigint;
  authorized: boolean;
  explained: boolean;
  openItems: OpenItem[];
  oldestUnpaid: OpenItem | null;
  overdue: boolean;
  overdueAmount: bigint;
};

export type Book = {
  rows: BookRow[];
  /** FIADO lines whose issuer is not a Fiado customer account (no AUTH_REQUIRED). Never shown as customers. */
  ignored: string[];
};

export type BookInput = {
  shop: string;
  movements: readonly Movement[];
  lines: readonly Line[];
  customers: Readonly<Record<string, CustomerInfo>>;
  today: string; // YYYY-MM-DD
};

export function book({ shop, movements, lines, customers, today }: BookInput): Book {
  const rows: BookRow[] = [];
  const ignored: string[] = [];

  for (const line of lines) {
    const info = customers[line.customer];
    if (!info?.authRequired || line.customer === shop) {
      ignored.push(line.customer);
      continue;
    }

    const queue: OpenItem[] = [];
    let pushed = 0n;
    let consumed = 0n;
    let overConsumed = false;

    const consume = (amount: bigint) => {
      let left = amount;
      for (const it of queue) {
        if (left === 0n) break;
        const take = it.remaining < left ? it.remaining : left;
        it.remaining -= take;
        left -= take;
      }
      if (left > 0n) overConsumed = true;
      consumed += amount - left;
    };

    for (const m of movements) {
      if (m.customer !== line.customer) continue;
      const kind = kindForShop(m, shop);
      if (kind === null) continue;
      if (kind === 'purchase' || kind === 'transfer_in') {
        const note = kind === 'purchase' ? decodeNote(m.memo) : { item: 'Transferred from another shop', due: undefined };
        queue.push({
          hash: m.hash,
          at: m.at,
          original: m.amount,
          remaining: m.amount,
          item: note.item,
          due: note.due ?? null,
          fromTransfer: kind === 'transfer_in',
        });
        pushed += m.amount;
      } else {
        consume(m.amount);
      }
    }

    const openItems = queue.filter((it) => it.remaining > 0n);
    const overdueAmount = openItems.reduce((sum, it) => (it.due !== null && it.due < today ? sum + it.remaining : sum), 0n);

    rows.push({
      customer: line.customer,
      name: info.name,
      limit: line.limit,
      owed: line.owed,
      headroom: line.limit > line.owed ? line.limit - line.owed : 0n,
      authorized: line.authorized,
      explained: !overConsumed && pushed - consumed === line.owed,
      openItems,
      oldestUnpaid: openItems[0] ?? null,
      overdue: overdueAmount > 0n,
      overdueAmount,
    });
  }

  // Overdue first, then the biggest tab, then name: the order a shopkeeper wants to read.
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.owed !== b.owed) return a.owed > b.owed ? -1 : 1;
    return (a.name ?? a.customer).localeCompare(b.name ?? b.customer);
  });
  return { rows, ignored };
}
