// A polite reminder a shopkeeper can send on WhatsApp. No server sends anything: this only builds the
// text and a wa.me link that opens the shopkeeper's own WhatsApp with the message ready to send.

import type { BookRow } from '../book';
import { formatAmount, formatDate } from './format';

export type ReminderInput = { shopName: string; row: BookRow; currency: string; today: string };

/** The message to send, or null when nothing is owed. */
export function reminderText({ shopName, row, currency, today }: ReminderInput): string | null {
  if (row.owed <= 0n) return null;
  const hello = row.name ? `Hello ${row.name}` : 'Hello';
  const total = formatAmount(row.owed, currency);

  const firstOverdue = row.openItems.find((i) => i.due !== null && i.due < today);
  if (firstOverdue && firstOverdue.due) {
    const late = formatAmount(row.overdueAmount, currency);
    return `${hello}, a friendly reminder from ${shopName}: ${late} is past due (${firstOverdue.item}, due ${formatDate(firstOverdue.due)}). Your tab is ${total} in all. Thank you!`;
  }

  const next = row.openItems.find((i) => i.due !== null);
  const due = next && next.due ? ` Next due: ${next.item}, ${formatDate(next.due)}.` : '';
  return `${hello}, from ${shopName}: your tab is ${total}.${due} Thank you!`;
}

/** Opens WhatsApp with the text ready, letting the shopkeeper choose the contact. */
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
