import { Account, Asset, AuthRequiredFlag, Keypair, type Transaction } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  buyOnCredit,
  closeCredit,
  feeBump,
  fiadoOf,
  joinAndOpen,
  joinCustomer,
  LimitError,
  openCredit,
  repayCash,
  repayDollars,
  setLimit,
  setupShop,
} from './builders';
import { ProfileError } from './profile';

const shopKp = Keypair.random();
const custKp = Keypair.random();
const SHOP = shopKp.publicKey();
const CUST = custKp.publicKey();
const shopAcct = () => new Account(SHOP, '100');
const custAcct = () => new Account(CUST, '200');

// op type + source (null = tx source) for each op, the shape every rule below is checked against.
const shape = (tx: Transaction) => tx.operations.map((o) => [o.type, o.source ?? null]);
// SDK v17 returns a built text memo as bytes, so decode before comparing.
const memoText = (tx: Transaction) => new TextDecoder().decode(tx.memo.value as Uint8Array);

describe('joinCustomer', () => {
  const tx = joinCustomer({ shop: shopAcct(), customer: CUST });

  it('sponsors a 0-XLM account and turns on AUTH_REQUIRED, in that order', () => {
    expect(tx.source).toBe(SHOP);
    expect(shape(tx)).toEqual([
      ['beginSponsoringFutureReserves', null],
      ['createAccount', null],
      ['setOptions', CUST],
      ['endSponsoringFutureReserves', CUST],
    ]);
    const create = tx.operations[1] as { destination: string; startingBalance: string };
    expect(create.destination).toBe(CUST);
    expect(create.startingBalance).toBe('0.0000000');
    expect((tx.operations[2] as { setFlags?: number }).setFlags).toBe(AuthRequiredFlag);
  });
});

describe('joinAndOpen', () => {
  const tx = joinAndOpen({ shop: shopAcct(), customer: CUST, limit: '10000', name: 'Bisi' });

  it('joins and opens the line in one tx; the shop pays its own trustline after sponsorship ends', () => {
    expect(tx.source).toBe(SHOP);
    expect(shape(tx)).toEqual([
      ['beginSponsoringFutureReserves', null],
      ['createAccount', null],
      ['setOptions', CUST],
      ['manageData', CUST],
      ['endSponsoringFutureReserves', CUST],
      ['changeTrust', null],
      ['setTrustLineFlags', CUST],
    ]);
  });

  it('puts the customer name on the sponsored account and the limit on the shop trustline', () => {
    const data = tx.operations[3] as { name: string; value: Uint8Array | string | null };
    expect(data.name).toBe('name');
    expect(new TextDecoder().decode(data.value as Uint8Array)).toBe('Bisi');
    expect((tx.operations[5] as { limit: string }).limit).toBe('10000.0000000');
    expect((tx.operations[1] as { startingBalance: string }).startingBalance).toBe('0.0000000');
  });

  it('refuses an unusable name before building', () => {
    expect(() => joinAndOpen({ shop: shopAcct(), customer: CUST, limit: '10', name: '' })).toThrow(ProfileError);
  });
});

describe('setupShop', () => {
  it('publishes the name and currency as the shop own data entries', () => {
    const tx = setupShop({ shop: shopAcct(), name: 'Mama Bisi', currency: '₦' });
    expect(shape(tx)).toEqual([
      ['manageData', null],
      ['manageData', null],
    ]);
    const [a, b] = tx.operations as { name: string; value: Uint8Array }[];
    expect([a!.name, new TextDecoder().decode(a!.value)]).toEqual(['name', 'Mama Bisi']);
    expect([b!.name, new TextDecoder().decode(b!.value)]).toEqual(['currency', '₦']);
  });
});

describe('openCredit', () => {
  const tx = openCredit({ shop: shopAcct(), customer: CUST, limit: '10000' });

  it('opens a trustline with the limit and has the customer authorize it, in one tx', () => {
    expect(shape(tx)).toEqual([
      ['changeTrust', null],
      ['setTrustLineFlags', CUST],
    ]);
    const trust = tx.operations[0] as { line: Asset; limit: string };
    expect(trust.line.equals(fiadoOf(CUST))).toBe(true);
    expect(trust.limit).toBe('10000.0000000');
    expect((tx.operations[1] as { trustor: string }).trustor).toBe(SHOP);
  });
});

describe('setLimit', () => {
  it('builds a changeTrust with the new limit', () => {
    const tx = setLimit({ shop: shopAcct(), customer: CUST, limit: '8000', owed: '3200' });
    expect((tx.operations[0] as { limit: string }).limit).toBe('8000.0000000');
  });

  it('refuses a limit below what is owed (the network would answer op_invalid_limit)', () => {
    expect(() => setLimit({ shop: shopAcct(), customer: CUST, limit: '1000', owed: '3200' })).toThrow(LimitError);
  });
});

describe('buyOnCredit + feeBump', () => {
  const inner = buyOnCredit({ customer: custAcct(), shop: SHOP, amount: '3200', note: { item: 'Rice 2 bags', due: '2026-10-20' } });

  it('is sourced by the customer, so only the customer can create the debt', () => {
    expect(inner.source).toBe(CUST);
    expect(shape(inner)).toEqual([['payment', null]]);
    const pay = inner.operations[0] as { destination: string; asset: Asset; amount: string };
    expect(pay.destination).toBe(SHOP);
    expect(pay.asset.equals(fiadoOf(CUST))).toBe(true);
    expect(pay.amount).toBe('3200.0000000');
  });

  it('carries the item and due date in the memo', () => {
    expect(inner.memo.type).toBe('text');
    expect(memoText(inner)).toBe('Rice 2 bags|261020');
  });

  it('is fee-bumped by the shop, so the customer pays nothing', () => {
    const outer = feeBump(inner, SHOP);
    expect(outer.feeSource).toBe(SHOP);
    expect(outer.innerTransaction.source).toBe(CUST);
  });
});

describe('repayments', () => {
  it('cash repay returns FIADO to its issuer (the burn), memo "cash"', () => {
    const tx = repayCash({ shop: shopAcct(), customer: CUST, amount: '1000' });
    const pay = tx.operations[0] as { destination: string; asset: Asset };
    expect(tx.source).toBe(SHOP);
    expect(pay.destination).toBe(CUST);
    expect(pay.asset.equals(fiadoOf(CUST))).toBe(true);
    expect(memoText(tx)).toBe('cash');
  });

  it('forgiveness is a repay with memo "forgiven"', () => {
    const tx = repayCash({ shop: shopAcct(), customer: CUST, amount: '200', kind: 'forgiven' });
    expect(memoText(tx)).toBe('forgiven');
  });

  it('dollar repay puts the dollar leg first and the burn second, in one tx', () => {
    const usd = new Asset('TUSD', Keypair.random().publicKey());
    const tx = repayDollars({ shop: shopAcct(), customer: CUST, dollar: usd, dollarAmount: '1', fiadoAmount: '1500' });
    expect(shape(tx)).toEqual([
      ['payment', CUST],
      ['payment', null],
    ]);
    expect((tx.operations[0] as { asset: Asset }).asset.equals(usd)).toBe(true);
    expect((tx.operations[1] as { asset: Asset }).asset.equals(fiadoOf(CUST))).toBe(true);
    expect(memoText(tx)).toBe('dollars');
  });
});

describe('closeCredit', () => {
  it('removes the line with limit 0 once settled', () => {
    const tx = closeCredit({ shop: shopAcct(), customer: CUST, owed: '0' });
    expect((tx.operations[0] as { limit: string }).limit).toBe('0.0000000');
  });

  it('refuses to close a line that still has debt', () => {
    expect(() => closeCredit({ shop: shopAcct(), customer: CUST, owed: '500' })).toThrow(LimitError);
  });
});
