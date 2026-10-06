// A purchase memo carries what was bought and when it is due, inside Stellar's 28-byte text memo.
// Format: "<item>|<YYMMDD>", or "<item>" when there is no due date. Fixed in DECISIONS.md.

export const MEMO_MAX_BYTES = 28;
/** The longest item text that still fits next to a due date ("|" + 6 digits). */
export const MAX_ITEM_BYTES_WITH_DUE = MEMO_MAX_BYTES - 7;
const DUE_RE = /^\d{6}$/;

export class MemoError extends Error {}

export type PurchaseNote = { item: string; due?: string /* YYYY-MM-DD */ };

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function encodeNote({ item, due }: PurchaseNote): string {
  const clean = item.trim().replace(/\|/g, '/');
  if (!clean) throw new MemoError('item is empty');
  let suffix = '';
  if (due) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
    if (!m) throw new MemoError(`due date must be YYYY-MM-DD, got "${due}"`);
    suffix = `|${m[1]!.slice(2)}${m[2]}${m[3]}`;
  }
  const memo = clean + suffix;
  if (bytes(memo) > MEMO_MAX_BYTES) {
    throw new MemoError(`"${memo}" is ${bytes(memo)} bytes; the limit is ${MEMO_MAX_BYTES}`);
  }
  return memo;
}

export function decodeNote(memo: string): PurchaseNote {
  const i = memo.lastIndexOf('|');
  if (i === -1) return { item: memo };
  const tail = memo.slice(i + 1);
  if (!DUE_RE.test(tail)) return { item: memo };
  return { item: memo.slice(0, i), due: `20${tail.slice(0, 2)}-${tail.slice(2, 4)}-${tail.slice(4, 6)}` };
}
