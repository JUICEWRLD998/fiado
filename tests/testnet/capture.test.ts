// Fixture capture. Runs a multi-shop scenario on testnet and saves the REAL Horizon payment feeds,
// so the book and record tests parse exactly what Horizon returns, offline, forever.
//
//   npm run fixtures        -> writes tests/fixtures/lifecycle.json
//
// Scenario (amounts are whole currency units):
//   shop A: opens a 5,000 line for Bisi; purchases Rice 2000, Oil 1500, Bread 1000;
//           cash repay 2500 (FIFO: clears Rice, 500 of Oil); forgives 200 (of Oil); transfers 100 of
//           Bisi's debt to shop B.                                       -> A holds 1,700
//   shop B: opens a 3,000 line (customer already exists); purchase Beans 700; cash repay 300;
//           receives the 100 transfer.                                   -> B holds 500
//   rogue : issues its OWN asset with the code FIADO and pays shop A 50. It must never be counted.

import { Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BASE_FEE,
  buyOnCredit,
  creditLine,
  feeBump,
  fiadoOf,
  fund,
  HORIZON_URL,
  joinAndOpen,
  NETWORK_PASSPHRASE,
  openCredit,
  readProfile,
  repayCash,
  server,
  setupShop,
  submit,
  xlmBalance,
} from '@/chain';

const A = Keypair.random();
const B = Keypair.random();
const C = Keypair.random();
const ROGUE = Keypair.random();

const load = (id: string) => server.loadAccount(id);
const raw = async (id: string) => new TransactionBuilder(await load(id), { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE });

async function send(signers: Keypair[], txb: TransactionBuilder) {
  const built = txb.setTimeout(120).build();
  built.sign(...signers);
  return submit(built);
}

async function buy(shop: Keypair, amount: string, item: string, due: string) {
  const inner = buyOnCredit({ customer: await load(C.publicKey()), shop: shop.publicKey(), amount, note: { item, due } });
  inner.sign(C);
  const outer = feeBump(inner, A.publicKey());
  outer.sign(A);
  return submit(outer);
}

async function accountJson(id: string) {
  const r = await fetch(`${HORIZON_URL}/accounts/${id}`);
  if (!r.ok) throw new Error(`account ${r.status} for ${id}`);
  const j = (await r.json()) as Record<string, unknown>;
  // keep only what the book reads; drop links and signers noise
  return { id: j.id, flags: j.flags, balances: j.balances, data: j.data };
}

async function feed(id: string) {
  const r = await fetch(`${HORIZON_URL}/accounts/${id}/payments?join=transactions&order=asc&limit=200`);
  if (!r.ok) throw new Error(`payments feed ${r.status} for ${id}`);
  return ((await r.json()) as { _embedded: { records: unknown[] } })._embedded.records;
}

beforeAll(async () => {
  await Promise.all([fund(A.publicKey()), fund(B.publicKey()), fund(ROGUE.publicKey())]);
});

describe('capture: multi-shop scenario', () => {
  it('runs the scenario and saves the fixture', async () => {
    // shops publish their profile
    for (const [kp, name, cur] of [[A, 'Mama Bisi Provisions', '₦'], [B, 'Alhaji Stores', '₦']] as const) {
      const tx = setupShop({ shop: await load(kp.publicKey()), name, currency: cur });
      tx.sign(kp);
      await submit(tx);
    }

    // first visit at A: join + open in ONE transaction (the new builder, proven live here)
    const join = joinAndOpen({ shop: await load(A.publicKey()), customer: C.publicKey(), limit: '5000', name: 'Bisi' });
    join.sign(A, C);
    await submit(join);
    expect(await xlmBalance(C.publicKey())).toBe('0.0000000');
    expect((await readProfile(C.publicKey()))?.name).toBe('Bisi');
    expect(await creditLine(A.publicKey(), C.publicKey())).toMatchObject({ limit: '5000.0000000', authorized: true });

    // purchases at A (customer-signed, shop A fee-bumps)
    await buy(A, '2000', 'Rice 2 bags', '2026-10-05');
    await buy(A, '1500', 'Oil 5L', '2026-10-20');
    await buy(A, '1000', 'Bread', '2026-11-01');

    // cash repay 2500, then write off 200
    for (const [amount, kind] of [['2500', 'cash'], ['200', 'forgiven']] as const) {
      const tx = repayCash({ shop: await load(A.publicKey()), customer: C.publicKey(), amount, kind });
      tx.sign(A);
      await submit(tx);
    }

    // second shop for an existing customer: open credit only
    const open = openCredit({ shop: await load(B.publicKey()), customer: C.publicKey(), limit: '3000' });
    open.sign(B, C);
    await submit(open);
    {
      const inner = buyOnCredit({ customer: await load(C.publicKey()), shop: B.publicKey(), amount: '700', note: { item: 'Beans', due: '2026-10-25' } });
      inner.sign(C);
      const outer = feeBump(inner, B.publicKey());
      outer.sign(B);
      await submit(outer);
    }
    {
      const tx = repayCash({ shop: await load(B.publicKey()), customer: C.publicKey(), amount: '300' });
      tx.sign(B);
      await submit(tx);
    }

    // A transfers 100 of Bisi's debt to B (shop-to-shop, no customer action)
    {
      const tx = (await raw(A.publicKey()))
        .addOperation(Operation.payment({ destination: B.publicKey(), asset: fiadoOf(C.publicKey()), amount: '100' }))
        .setTimeout(120)
        .build();
      tx.sign(A);
      await submit(tx);
    }

    // a rogue issuer mints its own asset with the code FIADO and pays shop A
    {
      const rogueAsset = new Asset('FIADO', ROGUE.publicKey());
      await send([A], (await raw(A.publicKey())).addOperation(Operation.changeTrust({ asset: rogueAsset })));
      await send([ROGUE], (await raw(ROGUE.publicKey())).addOperation(Operation.payment({ destination: A.publicKey(), asset: rogueAsset, amount: '50' })));
    }

    const lineA = await creditLine(A.publicKey(), C.publicKey());
    const lineB = await creditLine(B.publicKey(), C.publicKey());
    expect(lineA?.owed).toBe('1700.0000000');
    expect(lineB?.owed).toBe('500.0000000');

    const fixture = {
      capturedAt: new Date().toISOString(),
      network: 'testnet',
      accounts: { shopA: A.publicKey(), shopB: B.publicKey(), customer: C.publicKey(), rogue: ROGUE.publicKey() },
      names: { [C.publicKey()]: 'Bisi' },
      payments: { shopA: await feed(A.publicKey()), shopB: await feed(B.publicKey()), customer: await feed(C.publicKey()) },
      lines: { shopA: lineA, shopB: lineB },
      accounts_raw: {
        shopA: await accountJson(A.publicKey()),
        shopB: await accountJson(B.publicKey()),
        customer: await accountJson(C.publicKey()),
        rogue: await accountJson(ROGUE.publicKey()),
      },
      expect: {
        shopA: { owed: '1700', purchases: '4500', repaid: '2500', forgiven: '200', transferredOut: '100' },
        shopB: { owed: '500', purchases: '700', repaid: '300', transferredIn: '100' },
        customer: { issued: '5200', repaid: '2800', forgiven: '200', open: '2200', shops: 2 },
      },
    };
    mkdirSync('tests/fixtures', { recursive: true });
    writeFileSync('tests/fixtures/lifecycle.json', JSON.stringify(fixture, null, 2) + '\n');
    console.log(`fixture written: A=${A.publicKey()} B=${B.publicKey()} C=${C.publicKey()}`);
  });
});
