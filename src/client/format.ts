// Money and date display. Amounts are stored as bigint stroops; 1 FIADO is one unit of the shop's currency.

import { fromStroops, toAmount } from '../chain/amount';

/** 3200n * 10^7 -> "₦3,200"; a fractional amount keeps at least two decimals: "₦3,200.50". */
export function formatAmount(stroops: bigint, currency: string): string {
  const negative = stroops < 0n;
  const [whole = '0', frac] = fromStroops(negative ? -stroops : stroops).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac ? `${grouped}.${frac.length === 1 ? `${frac}0` : frac}` : grouped;
  return `${negative ? '-' : ''}${currency}${body}`;
}

const MONEY_RE = /^\d{1,12}(\.\d{1,2})?$/;

/** What a person types, with at most two decimals, to the canonical chain amount. Null if unusable or zero. */
export function parseMoney(input: string): string | null {
  const s = input.trim();
  if (!MONEY_RE.test(s)) return null;
  try {
    return toAmount(s);
  } catch {
    return null;
  }
}

export const shortKey = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-20" -> "20 Oct 2026". Locale-free on purpose, so a phone and a laptop agree. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** A date input value (YYYY-MM-DD) n days from now, in UTC. */
export function daysFromNow(n: number, now: Date = new Date()): string {
  return new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
