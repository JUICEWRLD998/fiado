// The network answers in codes. A shopkeeper needs words.

import { ChainRefusal } from '../chain/horizon';

export const isOverLimit = (err: unknown): boolean => err instanceof ChainRefusal && err.has('op_line_full');

export function explainRefusal(err: unknown): string {
  if (!(err instanceof ChainRefusal)) return err instanceof Error ? err.message : String(err);
  if (err.has('op_line_full')) return 'Over the credit limit. The network refused this purchase, so nothing was added to the tab.';
  if (err.has('op_no_trust')) return 'There is no credit line for this customer at this shop.';
  if (err.has('op_not_authorized')) return 'The customer has not approved this shop to hold their tab.';
  if (err.has('op_underfunded')) return 'There is not enough to complete this payment.';
  if (err.has('op_invalid_limit')) return 'The limit cannot be lower than what is owed now.';
  if (err.has('tx_bad_seq')) return 'Another action was in progress at the same moment. Nothing was changed; please try again.';
  if (err.has('tx_too_late')) return 'This took too long and expired. Nothing was changed; start again.';
  if (err.has('op_bad_auth') || err.has('tx_bad_auth')) return 'A required signature was missing, so the network rejected it.';
  if (err.has('op_already_exists')) return 'This account already exists.';
  return `The network refused it (${err.message.replace(/^refused: /, '')}).`;
}
