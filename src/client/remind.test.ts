import { describe, expect, it } from 'vitest';
import type { BookRow, OpenItem } from '../book';
import { toStroops } from '../chain/amount';
import { reminderText, whatsappLink } from './remind';

const S = (n: string) => toStroops(n);
const item = (name: string, remaining: string, due: string | null): OpenItem => ({
  hash: name,
  at: '2026-10-01T10:00:00Z',
  original: S(remaining),
  remaining: S(remaining),
  item: name,
  due,
  fromTransfer: false,
});

function row(over: Partial<BookRow> & { items: OpenItem[]; today: string }): BookRow {
  const owed = over.items.reduce((t, i) => t + i.remaining, 0n);
  const overdueAmount = over.items.reduce((t, i) => (i.due !== null && i.due < over.today ? t + i.remaining : t), 0n);
  return {
    customer: 'GC',
    name: 'Bisi',
    limit: S('10000'),
    owed,
    headroom: S('10000') - owed,
    authorized: true,
    explained: true,
    openItems: over.items,
    oldestUnpaid: over.items[0] ?? null,
    overdue: overdueAmount > 0n,
    overdueAmount,
    ...over,
  } as BookRow;
}

describe('reminderText', () => {
  it('says nothing when nothing is owed', () => {
    expect(reminderText({ shopName: 'Mama Bisi', currency: '₦', today: '2026-10-06', row: row({ items: [], today: '2026-10-06' }) })).toBeNull();
  });

  it('a tab that is not yet due is a gentle heads-up with the next due date', () => {
    const today = '2026-10-06';
    const text = reminderText({ shopName: 'Mama Bisi', currency: '₦', today, row: row({ today, items: [item('Rice 2 bags', '3200', '2026-10-20')] }) });
    expect(text).toBe('Hello Bisi, from Mama Bisi: your tab is ₦3,200. Next due: Rice 2 bags, 20 Oct 2026. Thank you!');
  });

  it('names the overdue amount and the first overdue item, and the whole tab', () => {
    const today = '2026-10-21';
    const text = reminderText({
      shopName: 'Mama Bisi',
      currency: '₦',
      today,
      row: row({ today, items: [item('Oil 5L', '700', '2026-10-20'), item('Bread', '1000', '2026-11-01')] }),
    });
    expect(text).toBe('Hello Bisi, a friendly reminder from Mama Bisi: ₦700 is past due (Oil 5L, due 20 Oct 2026). Your tab is ₦1,700 in all. Thank you!');
  });

  it('due today is not past due', () => {
    const today = '2026-10-20';
    const text = reminderText({ shopName: 'S', currency: '₦', today, row: row({ today, items: [item('Oil', '700', '2026-10-20')] }) });
    expect(text).not.toContain('past due');
  });

  it('works without a name or a due date, and uses the shop currency', () => {
    const today = '2026-10-06';
    const text = reminderText({ shopName: 'Tienda Lola', currency: 'S/', today, row: row({ today, name: null, items: [item('Pan', '15.5', null)] }) });
    expect(text).toBe('Hello, from Tienda Lola: your tab is S/15.50. Thank you!');
  });
});

describe('whatsappLink', () => {
  it('encodes the whole message, including ₦ and punctuation, and picks no contact', () => {
    const link = whatsappLink('Hello Bisi, your tab is ₦3,200. Thank you!');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe('Hello Bisi, your tab is ₦3,200. Thank you!');
    expect(link).not.toContain(' ');
  });
});
