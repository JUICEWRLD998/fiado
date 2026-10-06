// Testnet integration: the chain layer must reproduce every spike result, including each refusal.
// Run with `npm run test:testnet`. Tests run in order and share one shop and one customer.

import { Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BASE_FEE,
  buyOnCredit,
  ChainRefusal,
  closeCredit,
  creditLine,
  EXPLORER_TX,
  feeBump,
  fiadoOf,
  fund,
  joinCustomer,
  NETWORK_PASSPHRASE,
  openCredit,
  repayCash,
  repayDollars,
  server,
  submit,
  xlmBalance,
} from '@/chain';

const shop = Keypair.random();
const customer = Keypair.random();
const stranger = Keypair.random();
const dollarIssuer = Keypair.random();
const SHOP = shop.publicKey();
const CUST = customer.publicKey();
const TUSD = new Asset('TUSD', dollarIssuer.publicKey());

const load = (id: string) => server.loadAccount(id);
const raw = async (id: string) => new TransactionBuilder(await load(id), { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE });
const log = (label: string, hash: string) => console.log(`${label}: ${EXPLORER_TX}${hash}`);

async function expectRefusal(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected refusal ${code}`).toBeInstanceOf(ChainRefusal);
  const refusal = err as ChainRefusal;
  expect(refusal.has(code), `got ${refusal.message}`).toBe(true);
  log(`refused (${code})`, refusal.hash);
}

async function buy(amount: string, item: string, to = SHOP) {
  const inner = buyOnCredit({ customer: await load(CUST), shop: to, amount, note: { item, due: '2026-10-20' } });
  inner.sign(customer);
  const outer = feeBump(inner, SHOP);
  outer.sign(shop);
  return submit(outer);
}

beforeAll(async () => {
  await Promise.all([fund(SHOP), fund(stranger.publicKey()), fund(dollarIssuer.publicKey())]);
});

describe('credit line lifecycle on testnet', () => {
  it('joins a customer with 0 XLM, sponsored by the shop', async () => {
    const tx = joinCustomer({ shop: await load(SHOP), customer: CUST });
    tx.sign(shop, customer);
    log('join', (await submit(tx)).hash);
    expect(await xlmBalance(CUST)).toBe('0.0000000');
  });

  it('opens a 5,000 line the customer authorized', async () => {
    const tx = openCredit({ shop: await load(SHOP), customer: CUST, limit: '5000' });
    tx.sign(shop, customer);
    log('open', (await submit(tx)).hash);
    expect(await creditLine(SHOP, CUST)).toEqual({ customer: CUST, owed: '0.0000000', limit: '5000.0000000', authorized: true });
  });

  it('records a 3,000 purchase on credit, fee-bumped by the shop', async () => {
    log('buy 3000', (await buy('3000', 'Rice 2 bags')).hash);
    expect((await creditLine(SHOP, CUST))?.owed).toBe('3000.0000000');
  });

  it('NEGATIVE: the network refuses a purchase over the limit', async () => {
    await expectRefusal(buy('2500', 'Oil 5L'), 'op_line_full');
    expect((await creditLine(SHOP, CUST))?.owed).toBe('3000.0000000');
  });

  it('NEGATIVE: the shop cannot write a debt without the customer signing', async () => {
    const tx = (await raw(SHOP))
      .addOperation(Operation.payment({ source: CUST, destination: SHOP, asset: fiadoOf(CUST), amount: '100' }))
      .setTimeout(60)
      .build();
    tx.sign(shop);
    await expectRefusal(submit(tx), 'op_bad_auth');
  });

  it('NEGATIVE: a shop the customer never authorized cannot hold the debt', async () => {
    const trust = (await raw(stranger.publicKey()))
      .addOperation(Operation.changeTrust({ asset: fiadoOf(CUST), limit: '5000' }))
      .setTimeout(60)
      .build();
    trust.sign(stranger);
    await submit(trust);
    await expectRefusal(buy('100', 'Sugar', stranger.publicKey()), 'op_not_authorized');
  });

  it('cash repayment burns 1,000', async () => {
    const tx = repayCash({ shop: await load(SHOP), customer: CUST, amount: '1000' });
    tx.sign(shop);
    log('repay cash', (await submit(tx)).hash);
    expect((await creditLine(SHOP, CUST))?.owed).toBe('2000.0000000');
  });

  it('dollar repayment and burn are one transaction; a short dollar leg cancels the burn', async () => {
    const t1 = (await raw(SHOP)).addOperation(Operation.changeTrust({ asset: TUSD })).setTimeout(60).build();
    t1.sign(shop);
    await submit(t1);
    const t2 = (await raw(SHOP))
      .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: CUST }))
      .addOperation(Operation.changeTrust({ source: CUST, asset: TUSD }))
      .addOperation(Operation.endSponsoringFutureReserves({ source: CUST }))
      .setTimeout(60)
      .build();
    t2.sign(shop, customer);
    await submit(t2);
    const t3 = (await raw(dollarIssuer.publicKey()))
      .addOperation(Operation.payment({ destination: CUST, asset: TUSD, amount: '2' }))
      .setTimeout(60)
      .build();
    t3.sign(dollarIssuer);
    await submit(t3);

    const ok = repayDollars({ shop: await load(SHOP), customer: CUST, dollar: TUSD, dollarAmount: '1', fiadoAmount: '1500' });
    ok.sign(shop, customer);
    log('repay dollars', (await submit(ok)).hash);
    expect((await creditLine(SHOP, CUST))?.owed).toBe('500.0000000');

    const short = repayDollars({ shop: await load(SHOP), customer: CUST, dollar: TUSD, dollarAmount: '5', fiadoAmount: '100' });
    short.sign(shop, customer);
    await expectRefusal(submit(short), 'op_underfunded');
    expect((await creditLine(SHOP, CUST))?.owed).toBe('500.0000000');
  });

  it('NEGATIVE: the network itself refuses a limit below the debt (our guard bypassed)', async () => {
    const tx = (await raw(SHOP)).addOperation(Operation.changeTrust({ asset: fiadoOf(CUST), limit: '100' })).setTimeout(60).build();
    tx.sign(shop);
    await expectRefusal(submit(tx), 'op_invalid_limit');
  });

  it('settles, closes, and then refuses any purchase at the closed line', async () => {
    const repay = repayCash({ shop: await load(SHOP), customer: CUST, amount: '500' });
    repay.sign(shop);
    await submit(repay);
    const close = closeCredit({ shop: await load(SHOP), customer: CUST, owed: '0' });
    close.sign(shop);
    log('close', (await submit(close)).hash);
    expect(await creditLine(SHOP, CUST)).toBeNull();
    await expectRefusal(buy('10', 'Bread'), 'op_no_trust');
  });

  it('the customer never held or spent any XLM', async () => {
    expect(await xlmBalance(CUST)).toBe('0.0000000');
  });
});
