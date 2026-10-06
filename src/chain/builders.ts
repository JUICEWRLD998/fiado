// Pure transaction builders. They take loaded accounts (for sequence numbers) and return
// unsigned transactions; signing and submitting happen elsewhere. Every rule below was
// measured on testnet first (DECISIONS.md, spike 2026-10-06).

import {
  Asset,
  AuthRequiredFlag,
  FeeBumpTransaction,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { BASE_FEE, BUMP_FEE, FIADO_CODE, NETWORK_PASSPHRASE, TX_TIMEOUT_S } from './config';
import { toAmount, toStroops } from './amount';
import { encodeNote, type PurchaseNote } from './memo';
import { cleanCurrency, cleanName, CURRENCY_KEY, NAME_KEY } from './profile';

export const fiadoOf = (customer: string) => new Asset(FIADO_CODE, customer);

/** Any source TransactionBuilder accepts: an `Account` or a Horizon `AccountResponse`. */
export type Source = ConstructorParameters<typeof TransactionBuilder>[0];

const shopId = (s: Source) => s.accountId();

function builder(source: Source, memo?: string) {
  const b = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }).setTimeout(TX_TIMEOUT_S);
  if (memo) b.addMemo(Memo.text(memo));
  return b;
}

export class LimitError extends Error {}

/**
 * Join: the shop sponsors the customer's new account (0 XLM) and the customer turns on
 * AUTH_REQUIRED, so only shops the customer approves can ever hold their debt.
 * Signers: shop, customer.
 */
export function joinCustomer(p: { shop: Source; customer: string }): Transaction {
  return builder(p.shop)
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: p.customer }))
    .addOperation(Operation.createAccount({ destination: p.customer, startingBalance: '0' }))
    .addOperation(Operation.setOptions({ source: p.customer, setFlags: AuthRequiredFlag }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: p.customer }))
    .build();
}

/**
 * First visit: join a new customer AND open their line in one transaction. The shop sponsors the
 * customer's account (0 XLM) and its `name` entry; the customer turns on AUTH_REQUIRED; the shop
 * trusts the customer's FIADO up to `limit` and the customer authorizes that. Signers: shop, customer.
 * The shop's own trustline comes after endSponsoring, so the shop pays its own reserve.
 */
export function joinAndOpen(p: { shop: Source; customer: string; limit: string; name: string }): Transaction {
  const asset = fiadoOf(p.customer);
  return builder(p.shop)
    .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: p.customer }))
    .addOperation(Operation.createAccount({ destination: p.customer, startingBalance: '0' }))
    .addOperation(Operation.setOptions({ source: p.customer, setFlags: AuthRequiredFlag }))
    .addOperation(Operation.manageData({ source: p.customer, name: NAME_KEY, value: cleanName(p.name) }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: p.customer }))
    .addOperation(Operation.changeTrust({ asset, limit: toAmount(p.limit) }))
    .addOperation(
      Operation.setTrustLineFlags({ source: p.customer, trustor: shopId(p.shop), asset, flags: { authorized: true } }),
    )
    .build();
}

/** Shop onboarding: publish the shop's name and currency symbol as account data. Signer: shop. */
export function setupShop(p: { shop: Source; name: string; currency: string }): Transaction {
  return builder(p.shop)
    .addOperation(Operation.manageData({ name: NAME_KEY, value: cleanName(p.name) }))
    .addOperation(Operation.manageData({ name: CURRENCY_KEY, value: cleanCurrency(p.currency) }))
    .build();
}

/**
 * Open a credit line: the shop trusts the customer's FIADO up to `limit`, and the customer
 * authorizes that shop to hold it. One transaction. Signers: shop, customer.
 */
export function openCredit(p: { shop: Source; customer: string; limit: string }): Transaction {
  const asset = fiadoOf(p.customer);
  return builder(p.shop)
    .addOperation(Operation.changeTrust({ asset, limit: toAmount(p.limit) }))
    .addOperation(
      Operation.setTrustLineFlags({ source: p.customer, trustor: p.shop.accountId(), asset, flags: { authorized: true } }),
    )
    .build();
}

/**
 * Change the limit. The network refuses a limit below the open debt (op_invalid_limit),
 * so we refuse it first and say why. Signer: shop.
 */
export function setLimit(p: { shop: Source; customer: string; limit: string; owed: string }): Transaction {
  const limit = toAmount(p.limit);
  if (toStroops(limit) < toStroops(p.owed)) {
    throw new LimitError(`the limit cannot be lower than what is owed now (${p.owed})`);
  }
  return builder(p.shop).addOperation(Operation.changeTrust({ asset: fiadoOf(p.customer), limit })).build();
}

/**
 * Buy on credit: the customer pays FIADO to the shop. Only the customer can sign this, so only
 * the customer can create a debt. Signer: customer. Then the shop wraps it with feeBump().
 */
export function buyOnCredit(p: { customer: Source; shop: string; amount: string; note: PurchaseNote }): Transaction {
  return builder(p.customer, encodeNote(p.note))
    .addOperation(
      Operation.payment({ destination: p.shop, asset: fiadoOf(p.customer.accountId()), amount: toAmount(p.amount) }),
    )
    .build();
}

/** The shop pays the fee for a customer-signed transaction; the customer holds no XLM. Signer: shop. */
export function feeBump(inner: Transaction, shop: string): FeeBumpTransaction {
  return TransactionBuilder.buildFeeBumpTransaction(shop, BUMP_FEE, inner, NETWORK_PASSPHRASE);
}

/**
 * Cash repayment (or forgiveness): the shop returns FIADO to its issuer, which burns it.
 * Signer: shop. Memo "cash" by default, "forgiven" when the shop writes the debt off.
 */
export function repayCash(p: { shop: Source; customer: string; amount: string; kind?: 'cash' | 'forgiven' }): Transaction {
  return builder(p.shop, p.kind ?? 'cash')
    .addOperation(Operation.payment({ destination: p.customer, asset: fiadoOf(p.customer), amount: toAmount(p.amount) }))
    .build();
}

/**
 * Dollar repayment: the customer's dollars go to the shop and the shop burns the matching FIADO,
 * in one transaction. If the dollar leg fails, the burn does not happen. Signers: shop, customer.
 */
export function repayDollars(p: {
  shop: Source;
  customer: string;
  dollar: Asset;
  dollarAmount: string;
  fiadoAmount: string;
}): Transaction {
  return builder(p.shop, 'dollars')
    .addOperation(
      Operation.payment({ source: p.customer, destination: p.shop.accountId(), asset: p.dollar, amount: toAmount(p.dollarAmount) }),
    )
    .addOperation(Operation.payment({ destination: p.customer, asset: fiadoOf(p.customer), amount: toAmount(p.fiadoAmount) }))
    .build();
}

/** Close a settled line: limit 0 removes the trustline and returns the shop's reserve. Signer: shop. */
export function closeCredit(p: { shop: Source; customer: string; owed: string }): Transaction {
  if (toStroops(p.owed) !== 0n) throw new LimitError(`settle the ${p.owed} owed before closing the line`);
  return builder(p.shop).addOperation(Operation.changeTrust({ asset: fiadoOf(p.customer), limit: '0' })).build();
}
