import { Horizon, type FeeBumpTransaction, type Transaction } from '@stellar/stellar-sdk';
import { FRIENDBOT_URL, HORIZON_URL } from './config';
import { fiadoOf } from './builders';

export const server = new Horizon.Server(HORIZON_URL);

export type ResultCodes = { transaction?: string; inner_transaction?: string; operations?: string[] };

/** The network said no. `codes` is exactly what Horizon returned; `hash` identifies the attempt. */
export class ChainRefusal extends Error {
  constructor(
    readonly codes: ResultCodes,
    readonly hash: string,
  ) {
    super(`refused: ${[codes.transaction, codes.inner_transaction, ...(codes.operations ?? [])].filter(Boolean).join(', ')}`);
  }
  has(code: string): boolean {
    return this.codes.transaction === code || this.codes.inner_transaction === code || !!this.codes.operations?.includes(code);
  }
}

export const hashOf = (tx: Transaction | FeeBumpTransaction) => Buffer.from(tx.hash()).toString('hex');

/** Submits, and turns a Horizon result-code failure into a ChainRefusal. Transport errors are rethrown as-is. */
export async function submit(tx: Transaction | FeeBumpTransaction): Promise<{ hash: string; ledger: number }> {
  const hash = hashOf(tx);
  try {
    const res = await server.submitTransaction(tx);
    return { hash, ledger: res.ledger };
  } catch (err) {
    const codes = (err as { response?: { data?: { extras?: { result_codes?: ResultCodes } } } })?.response?.data?.extras
      ?.result_codes;
    if (codes) throw new ChainRefusal(codes, hash);
    throw err;
  }
}

export async function fund(accountId: string): Promise<void> {
  const r = await fetch(`${FRIENDBOT_URL}?addr=${accountId}`);
  if (!r.ok) throw new Error(`friendbot ${r.status} for ${accountId}`);
}

export type CreditLine = { customer: string; owed: string; limit: string; authorized: boolean };

/** A shop's view of one customer's line, read from the shop's own trustline. null = no line. */
export async function creditLine(shop: string, customer: string): Promise<CreditLine | null> {
  const acct = await server.loadAccount(shop);
  const asset = fiadoOf(customer);
  for (const b of acct.balances) {
    if (b.asset_type !== 'credit_alphanum4' && b.asset_type !== 'credit_alphanum12') continue;
    if (b.asset_code !== asset.getCode() || b.asset_issuer !== asset.getIssuer()) continue;
    return { customer, owed: b.balance, limit: b.limit, authorized: Boolean(b.is_authorized) };
  }
  return null;
}

export async function xlmBalance(accountId: string): Promise<string> {
  const acct = await server.loadAccount(accountId);
  return acct.balances.find((b) => b.asset_type === 'native')?.balance ?? '0';
}
