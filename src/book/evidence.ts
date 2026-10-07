// What one shop's feed proves, as plain counts. Pure and deterministic: Horizon payments in, numbers out.
//
// A refusal is a FIADO purchase the network refused for being over the limit. It never reaches a successful
// ledger entry, so it is read from the failed transactions in the shop's feed and counted only when the
// transaction's own result says "line full" (the trustline limit). Any other failure is not a refusal.
// Counts only, never amounts: shops use different currencies, so a sum across shops would mean nothing.

import { xdr } from '@stellar/stellar-sdk';
import { FIADO_CODE } from '../chain/config';
import { kindForShop, toMovements, type RawPayment } from './movements';

export type ShopEvidence = {
  /** Customers who have bought on credit here at least once. */
  customers: number;
  purchases: number;
  /** Cash or dollar repayments that burned part of a tab. */
  repayments: number;
  /** Debts the shop wrote off (not a repayment). */
  writeOffs: number;
  /** Purchases the network refused for going over the credit limit. */
  refusals: number;
  /** Ledger time of the first and last thing counted, or null for an empty feed. */
  first: string | null;
  last: string | null;
};

/** True when a transaction result (base64 XDR) is a payment that failed because the line was full. */
export function isLineFull(resultXdr: string | undefined): boolean {
  if (!resultXdr) return false;
  try {
    // The decoded result is a class; its JSON form is stable: { result: { tx_failed: [{ op_inner: { payment: 'line_full' } }] } }
    const json = JSON.parse(JSON.stringify(xdr.TransactionResult.fromXDR(resultXdr, 'base64'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as {
      result?: Record<string, unknown>;
    };
    const outer = json.result ?? {};
    const inner = (outer.tx_fee_bump_inner_failed as { result?: { result?: Record<string, unknown> } } | undefined)?.result?.result ?? outer;
    const ops = inner.tx_failed;
    if (!Array.isArray(ops)) return false;
    return ops.some((op) => (op as { op_inner?: { payment?: string } }).op_inner?.payment === 'line_full');
  } catch {
    return false;
  }
}

export function evidence(shop: string, payments: readonly RawPayment[]): ShopEvidence {
  const buyers = new Set<string>();
  let purchases = 0;
  let repayments = 0;
  let writeOffs = 0;
  const times: string[] = [];

  for (const m of toMovements(payments)) {
    const kind = kindForShop(m, shop);
    if (kind === 'purchase') {
      purchases += 1;
      buyers.add(m.customer);
    } else if (kind === 'repay') repayments += 1;
    else if (kind === 'forgiven') writeOffs += 1;
    else continue;
    times.push(m.at);
  }

  const refused = new Set<string>();
  for (const p of payments) {
    if (p.type !== 'payment' || p.asset_code !== FIADO_CODE || !p.asset_issuer) continue;
    if (p.transaction_successful !== false && p.transaction?.successful !== false) continue;
    // a refused purchase: the customer (the asset's issuer) paying their own FIADO to this shop
    if (p.from !== p.asset_issuer || p.to !== shop || p.asset_issuer === shop) continue;
    if (!isLineFull(p.transaction?.result_xdr)) continue;
    if (refused.has(p.transaction_hash)) continue;
    refused.add(p.transaction_hash);
    times.push(p.created_at);
  }

  times.sort();
  return {
    customers: buyers.size,
    purchases,
    repayments,
    writeOffs,
    refusals: refused.size,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
  };
}
