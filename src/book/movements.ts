// Turns raw Horizon JSON into plain FIADO movements. Pure: no network, no clock.
// Everything the book and the record say is arithmetic over these movements.

import { toStroops } from '../chain/amount';
import { FIADO_CODE } from '../chain/config';
import { decodeData, NAME_KEY } from '../chain/profile';

/** One record from Horizon `/accounts/<id>/payments?join=transactions`. Only the fields we read. */
export type RawPayment = {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  asset_code?: string;
  asset_issuer?: string;
  from?: string;
  to?: string;
  amount?: string;
  transaction?: { memo?: string; memo_type?: string; successful?: boolean };
};

export type RawBalance = {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
  is_authorized?: boolean;
};

/** One record from Horizon `/accounts/<id>`. Only the fields we read. */
export type RawAccount = {
  id?: string;
  flags?: { auth_required?: boolean };
  balances?: RawBalance[];
  data?: Record<string, string>;
};

/** A FIADO payment, where `customer` is the asset issuer: the one account that can create this debt. */
export type Movement = {
  id: string;
  hash: string;
  at: string; // ISO 8601 UTC, from the ledger
  customer: string;
  from: string;
  to: string;
  amount: bigint; // stroops
  memo: string;
};

export type Kind = 'purchase' | 'repay' | 'forgiven' | 'transfer_in' | 'transfer_out';

const byId = (a: Movement, b: Movement) => {
  const x = BigInt(a.id);
  const y = BigInt(b.id);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Keeps successful FIADO payments, in ledger order, once each (feeds from two shops overlap).
 * The asset issuer is kept on every movement, because anyone can issue an asset coded "FIADO":
 * a movement only means something relative to the issuer you are asking about.
 */
export function toMovements(payments: readonly RawPayment[]): Movement[] {
  const seen = new Map<string, Movement>();
  for (const p of payments) {
    if (p.type !== 'payment') continue;
    if (p.asset_code !== FIADO_CODE || !p.asset_issuer) continue;
    if (p.transaction_successful === false || p.transaction?.successful === false) continue;
    if (!p.from || !p.to || !p.amount) continue;
    const t = p.transaction;
    seen.set(p.id, {
      id: p.id,
      hash: p.transaction_hash,
      at: p.created_at,
      customer: p.asset_issuer,
      from: p.from,
      to: p.to,
      amount: toStroops(p.amount),
      memo: t?.memo_type === 'text' && t.memo ? t.memo : '',
    });
  }
  return [...seen.values()].sort(byId);
}

/** What a movement means to one shop, or null when the shop is not a party to it. */
export function kindForShop(m: Movement, shop: string): Kind | null {
  if (shop === m.customer) return null;
  if (m.to === shop) return m.from === m.customer ? 'purchase' : 'transfer_in';
  if (m.from === shop) return m.to === m.customer ? (m.memo === 'forgiven' ? 'forgiven' : 'repay') : 'transfer_out';
  return null;
}

export type Line = { customer: string; owed: bigint; limit: bigint; authorized: boolean };

/** The shop's FIADO trustlines. `owed` is the trustline balance: what the network says the customer owes. */
export function toLines(balances: readonly RawBalance[] | undefined): Line[] {
  const lines: Line[] = [];
  for (const b of balances ?? []) {
    if (b.asset_code !== FIADO_CODE || !b.asset_issuer || b.limit === undefined) continue;
    lines.push({ customer: b.asset_issuer, owed: toStroops(b.balance), limit: toStroops(b.limit), authorized: Boolean(b.is_authorized) });
  }
  return lines;
}

export type CustomerInfo = { name: string | null; authRequired: boolean };

export function toCustomerInfo(account: RawAccount): CustomerInfo {
  return { name: decodeData(account.data?.[NAME_KEY]), authRequired: account.flags?.auth_required === true };
}

/** Today's date in UTC as YYYY-MM-DD, the same form as a due date. */
export const todayUtc = (now: Date = new Date()) => now.toISOString().slice(0, 10);
