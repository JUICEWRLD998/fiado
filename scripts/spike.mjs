// Phase 0 spike: does a Stellar trustline limit work as a shop's credit line?
// Runs on testnet only. Every step states what it expects, and the script exits 1
// if any step disagrees, so the negative controls are checked, not just printed.
//
//   node scripts/spike.mjs            -> prints a step table, writes docs/spike/<date>.json

import * as S from '@stellar/stellar-sdk';
import { mkdirSync, writeFileSync } from 'node:fs';

const HORIZON = 'https://horizon-testnet.stellar.org';
const NET = S.Networks.TESTNET;
const server = new S.Horizon.Server(HORIZON);

const shop = S.Keypair.random();      // the shopkeeper, funded by friendbot
const customer = S.Keypair.random();  // the customer, never funded: the shop sponsors it
const stranger = S.Keypair.random();  // a shop the customer never approved
const dollarIssuer = S.Keypair.random(); // our own testnet dollar, for the atomic repay

const FIADO = new S.Asset('FIADO', customer.publicKey());
const TUSD = new S.Asset('TUSD', dollarIssuer.publicKey());

const steps = [];

async function friendbot(kp) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status} for ${kp.publicKey()}`);
}

function codesOf(err) {
  const rc = err?.response?.data?.extras?.result_codes;
  if (!rc) return { error: String(err?.message ?? err) };
  return rc;
}

function flat(codes) {
  return JSON.stringify(codes);
}

// expect: 'ok' or a result code that must appear in the failure codes.
async function run(label, expect, buildAndSign) {
  let outcome, hash = null, codes = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const tx = await buildAndSign();
      // Hash computed locally, so failed-but-on-ledger refusals (op_line_full, ...) are linkable too.
      hash = Buffer.from(tx.hash()).toString('hex');
      await server.submitTransaction(tx);
      outcome = 'ok';
    } catch (err) {
      codes = codesOf(err);
      outcome = flat(codes);
      // Retry only transport errors; a result code is the network's answer and is never retried.
      if (codes.error && attempt < 3) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    }
    break;
  }
  const pass = expect === 'ok' ? outcome === 'ok' : outcome.includes(expect);
  steps.push({ label, expect, outcome, pass, hash });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      expect=${expect} got=${outcome}${hash ? ` tx=${hash}` : ''}`);
  return pass;
}

async function txFrom(sourcePub, ops, fee = '100') {
  const acct = await server.loadAccount(sourcePub);
  const b = new S.TransactionBuilder(acct, { fee, networkPassphrase: NET }).setTimeout(60);
  ops.forEach((op) => b.addOperation(op));
  return b.build();
}

// A customer-sourced tx, fee-bumped by the shop: the customer holds 0 XLM and pays nothing.
async function customerTxBumped(ops) {
  const inner = await txFrom(customer.publicKey(), ops);
  inner.sign(customer);
  const outer = S.TransactionBuilder.buildFeeBumpTransaction(shop, '200', inner, NET);
  outer.sign(shop);
  return outer;
}

async function balanceOf(pub, asset) {
  const a = await server.loadAccount(pub);
  if (asset === 'native') return a.balances.find((b) => b.asset_type === 'native')?.balance;
  const line = a.balances.find((b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
  return line ? { balance: line.balance, limit: line.limit, authorized: line.is_authorized } : null;
}

function check(label, expect, outcome) {
  const pass = outcome === expect;
  steps.push({ label, expect, outcome, pass, hash: null });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}\n      expect=${expect} got=${outcome}`);
}

async function main() {
  console.log('shop    ', shop.publicKey());
  console.log('customer', customer.publicKey());
  await Promise.all([friendbot(shop), friendbot(stranger), friendbot(dollarIssuer)]);

  // 1. Join: the shop sponsors the customer's account (0 XLM) and the customer turns on AUTH_REQUIRED.
  await run('join: sponsored create, 0 XLM, AUTH_REQUIRED', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.beginSponsoringFutureReserves({ sponsoredId: customer.publicKey() }),
      S.Operation.createAccount({ destination: customer.publicKey(), startingBalance: '0' }),
      S.Operation.setOptions({ source: customer.publicKey(), setFlags: S.AuthRequiredFlag }),
      S.Operation.endSponsoringFutureReserves({ source: customer.publicKey() }),
    ]);
    tx.sign(shop, customer);
    return tx;
  });
  check('customer XLM balance after join', '0.0000000', await balanceOf(customer.publicKey(), 'native'));

  // 2. Open a credit line: shop trusts FIADO:customer up to 5,000; the customer authorizes that shop.
  await run('open line: shop trustline limit 5000 + customer authorizes', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.changeTrust({ asset: FIADO, limit: '5000' }),
      S.Operation.setTrustLineFlags({
        source: customer.publicKey(), trustor: shop.publicKey(), asset: FIADO, flags: { authorized: true },
      }),
    ]);
    tx.sign(shop, customer);
    return tx;
  });

  // 3. Buy on credit within the limit (customer signs, shop fee-bumps).
  await run('buy 3000 on credit (fee-bumped)', 'ok', () =>
    customerTxBumped([S.Operation.payment({ destination: shop.publicKey(), asset: FIADO, amount: '3000' })]));

  // 4. NEGATIVE CONTROL: 2,500 more would put the shop at 5,500 > 5,000.
  await run('buy 2500 more -> over the limit', 'op_line_full', () =>
    customerTxBumped([S.Operation.payment({ destination: shop.publicKey(), asset: FIADO, amount: '2500' })]));

  // 5. NEGATIVE CONTROL: the shop cannot create debt without the customer's signature.
  // The tx source (shop) is properly signed, so it reaches the ledger and fails at the op:
  // op_bad_auth, not tx_bad_auth (first run 2026-10-06 predicted tx_bad_auth; corrected).
  await run('shop forges a purchase without customer signature', 'op_bad_auth', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.payment({ source: customer.publicKey(), destination: shop.publicKey(), asset: FIADO, amount: '100' }),
    ]);
    tx.sign(shop);
    return tx;
  });

  // 6. NEGATIVE CONTROL: a shop the customer never authorized cannot hold the customer's IOU.
  await run('stranger opens a FIADO trustline (unauthorized)', 'ok', async () => {
    const tx = await txFrom(stranger.publicKey(), [S.Operation.changeTrust({ asset: FIADO, limit: '5000' })]);
    tx.sign(stranger);
    return tx;
  });
  await run('customer pays the unauthorized stranger', 'op_not_authorized', () =>
    customerTxBumped([S.Operation.payment({ destination: stranger.publicKey(), asset: FIADO, amount: '100' })]));

  // 7. Cash repayment: the shop returns 1,000 FIADO to the issuer, which burns it.
  await run('cash repay 1000 (shop returns IOU to issuer = burn)', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.payment({ destination: customer.publicKey(), asset: FIADO, amount: '1000' }),
    ]);
    tx.sign(shop);
    return tx;
  });
  check('shop FIADO balance after cash repay', '2000.0000000', (await balanceOf(shop.publicKey(), FIADO))?.balance);

  // 8. Atomic dollar repay: customer pays 1 TUSD, shop burns 1,500 FIADO, one tx, both sign.
  await run('setup: shop trusts TUSD', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [S.Operation.changeTrust({ asset: TUSD })]);
    tx.sign(shop);
    return tx;
  });
  await run('setup: customer TUSD trustline, reserve sponsored by shop', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.beginSponsoringFutureReserves({ sponsoredId: customer.publicKey() }),
      S.Operation.changeTrust({ source: customer.publicKey(), asset: TUSD }),
      S.Operation.endSponsoringFutureReserves({ source: customer.publicKey() }),
    ]);
    tx.sign(shop, customer);
    return tx;
  });
  await run('setup: issue 2 TUSD to customer', 'ok', async () => {
    const tx = await txFrom(dollarIssuer.publicKey(), [
      S.Operation.payment({ destination: customer.publicKey(), asset: TUSD, amount: '2' }),
    ]);
    tx.sign(dollarIssuer);
    return tx;
  });
  await run('atomic repay: 1 TUSD in + 1500 FIADO burned, one tx', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.payment({ source: customer.publicKey(), destination: shop.publicKey(), asset: TUSD, amount: '1' }),
      S.Operation.payment({ destination: customer.publicKey(), asset: FIADO, amount: '1500' }),
    ]);
    tx.sign(shop, customer);
    return tx;
  });
  // NEGATIVE CONTROL for atomicity: the dollar leg cannot cover 5 TUSD, so the burn must not happen either.
  await run('atomic repay with insufficient TUSD -> whole tx reverts', 'op_underfunded', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.payment({ source: customer.publicKey(), destination: shop.publicKey(), asset: TUSD, amount: '5' }),
      S.Operation.payment({ destination: customer.publicKey(), asset: FIADO, amount: '100' }),
    ]);
    tx.sign(shop, customer);
    return tx;
  });
  check('shop FIADO after atomic repay + reverted repay', '500.0000000', (await balanceOf(shop.publicKey(), FIADO))?.balance);

  // 9. Lowering the limit below the open debt: what does the protocol do?
  await run('lower limit to 100 while 500 is owed', 'op_invalid_limit', async () => {
    const tx = await txFrom(shop.publicKey(), [S.Operation.changeTrust({ asset: FIADO, limit: '100' })]);
    tx.sign(shop);
    return tx;
  });

  // 10. Settle and close: repay the last 500, remove the line, then the customer cannot buy there.
  await run('cash repay final 500', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [
      S.Operation.payment({ destination: customer.publicKey(), asset: FIADO, amount: '500' }),
    ]);
    tx.sign(shop);
    return tx;
  });
  await run('close line (limit 0 removes trustline)', 'ok', async () => {
    const tx = await txFrom(shop.publicKey(), [S.Operation.changeTrust({ asset: FIADO, limit: '0' })]);
    tx.sign(shop);
    return tx;
  });
  await run('buy at a closed line', 'op_no_trust', () =>
    customerTxBumped([S.Operation.payment({ destination: shop.publicKey(), asset: FIADO, amount: '10' })]));

  check('customer still holds 0 XLM at the end', '0.0000000', await balanceOf(customer.publicKey(), 'native'));

  const failed = steps.filter((s) => !s.pass);
  const out = {
    ranAt: new Date().toISOString(),
    network: 'testnet',
    horizon: HORIZON,
    accounts: { shop: shop.publicKey(), customer: customer.publicKey(), stranger: stranger.publicKey(), dollarIssuer: dollarIssuer.publicKey() },
    steps,
    summary: { total: steps.length, passed: steps.length - failed.length, failed: failed.length },
  };
  mkdirSync('docs/spike', { recursive: true });
  const file = `docs/spike/${out.ranAt.slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`\n${out.summary.passed}/${out.summary.total} passed -> ${file}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
