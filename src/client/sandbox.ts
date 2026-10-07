// The practice shop behind /try. It is the real thing on the real test network: a fresh shop and two fresh customers
// are created in the visitor's browser, each with a random key that lives in memory only and is gone when the tab
// closes. Every join, purchase and refusal below is a genuine transaction anyone can look up. What makes it a
// practice shop is only that it is labelled so, starts in one click, and is never counted as a real shop.

import { Keypair } from '@stellar/stellar-sdk';
import { buyOnCredit, feeBump, joinAndOpen } from '../chain/builders';
import { ChainRefusal, server, submit } from '../chain/horizon';
import { explainRefusal } from './explain';
import { repay, setupShopAccount } from './flows';

export const PRACTICE_SHOP_NAME = 'Demo · Mama Bisi’s shop';
export const PRACTICE_CURRENCY = '₦';

type Plan = { name: string; limit: string; firstItem: string; firstAmount: string };

/** Bisi is close enough to her limit that one more ordinary purchase is refused: the moment worth seeing. */
export const PRACTICE_CUSTOMERS: readonly Plan[] = [
  { name: 'Demo Bisi', limit: '10000', firstItem: 'Rice 2 bags', firstAmount: '3200' },
  { name: 'Demo Tunde', limit: '5000', firstItem: 'Bread', firstAmount: '1500' },
];

export type PracticeCustomer = { key: Keypair; name: string; limit: string };
export type Practice = { shop: Keypair; customers: PracticeCustomer[] };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/** A just-created account can take a moment to be readable, and a just-used one to show its next sequence number. */
async function loadAccount(id: string) {
  for (let i = 1; ; i++) {
    try {
      return await server.loadAccount(id);
    } catch (e) {
      if (statusOf(e) !== 404 || i >= 12) throw e;
      await sleep(1000);
    }
  }
}

async function withFreshSequence<T>(attempt: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (e) {
      if (!(e instanceof ChainRefusal && e.has('tx_bad_seq')) || i >= 4) throw e;
      await sleep(1500);
    }
  }
}

export type Outcome =
  | { ok: true; hash: string }
  | { ok: false; hash: string | null; message: string; overLimit: boolean };

/** One purchase on credit: the customer builds and signs it, the shop pays the fee and submits. The network decides. */
export async function practiceBuy(p: Practice, customer: number, input: { amount: string; item: string; due?: string }): Promise<Outcome> {
  const c = p.customers[customer];
  if (!c) throw new Error('no such customer');
  try {
    const r = await withFreshSequence(async () => {
      const inner = buyOnCredit({
        customer: await loadAccount(c.key.publicKey()),
        shop: p.shop.publicKey(),
        amount: input.amount,
        note: { item: input.item, due: input.due },
      });
      inner.sign(c.key);
      const outer = feeBump(inner, p.shop.publicKey());
      outer.sign(p.shop);
      return submit(outer);
    });
    return { ok: true, hash: r.hash };
  } catch (e) {
    if (e instanceof ChainRefusal) return { ok: false, hash: e.hash, message: explainRefusal(e), overLimit: e.has('op_line_full') };
    throw e;
  }
}

/** A cash repayment: the shop returns the customer's IOU to them, which burns it. */
export async function practiceRepay(p: Practice, customer: number, amount: string): Promise<string> {
  const c = p.customers[customer];
  if (!c) throw new Error('no such customer');
  return withFreshSequence(() => repay(p.shop, { customer: c.key.publicKey(), amount }));
}

/**
 * Builds the whole practice shop on the test network: fund the shop, publish its name, open each customer's account
 * and credit line (the shop pays for it, the customer signs), then record one opening purchase each.
 */
export async function createPractice(progress: (text: string) => void): Promise<Practice> {
  const shop = Keypair.random();
  await setupShopAccount(shop, { name: PRACTICE_SHOP_NAME, currency: PRACTICE_CURRENCY }, progress);
  const practice: Practice = { shop, customers: PRACTICE_CUSTOMERS.map((c) => ({ key: Keypair.random(), name: c.name, limit: c.limit })) };

  for (const [i, plan] of PRACTICE_CUSTOMERS.entries()) {
    const c = practice.customers[i]!;
    progress(`Opening ${plan.name}’s credit line…`);
    await withFreshSequence(async () => {
      const tx = joinAndOpen({ shop: await loadAccount(shop.publicKey()), customer: c.key.publicKey(), limit: plan.limit, name: plan.name });
      tx.sign(shop);
      tx.sign(c.key);
      return submit(tx);
    });
    progress(`${plan.name} buys ${plan.firstItem} on credit…`);
    await sleep(2500); // the new account is not readable on Horizon for a moment; waiting avoids a needless 404
    const first = await practiceBuy(practice, i, { amount: plan.firstAmount, item: plan.firstItem });
    if (!first.ok) throw new Error(first.message);
  }
  return practice;
}
