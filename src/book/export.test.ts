import { Account, Keypair, Networks, type FeeBumpTransaction, type Transaction } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { buyOnCredit, feeBump, joinAndOpen, repayCash } from '../chain/builders';
import { NETWORK_PASSPHRASE } from '../chain/config';
import { fixture } from './fixture.test-helpers';
import { verifyEnvelope, verifyExport, type BookExport } from './export';

const shop = Keypair.random();
const cust = Keypair.random();
const other = Keypair.random();
const SHOP = shop.publicKey();
const CUST = cust.publicKey();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const xdr = (t: Transaction | FeeBumpTransaction) => t.toEnvelope().toXDR('base64');

const join = (signers: Keypair[]) => {
  const t = joinAndOpen({ shop: new Account(SHOP, '1'), customer: CUST, limit: '5000', name: 'Bisi' });
  t.sign(...signers);
  return t;
};

const purchase = (innerSigners: Keypair[], bumper: Keypair | null) => {
  const inner = buyOnCredit({ customer: new Account(CUST, '7'), shop: SHOP, amount: '3200', note: { item: 'Rice' } });
  inner.sign(...innerSigners);
  const outer = feeBump(inner, SHOP);
  if (bumper) outer.sign(bumper);
  return outer;
};

describe('verifyEnvelope', () => {
  it('passes a join signed by both the shop and the customer', () => {
    const t = join([shop, cust]);
    expect(verifyEnvelope(xdr(t), NETWORK_PASSPHRASE, hex(t.hash()))).toMatchObject({ ok: true, problems: [] });
  });

  it('flags a join the customer never signed (planted control: the shop alone cannot speak for them)', () => {
    const r = verifyEnvelope(xdr(join([shop])), NETWORK_PASSPHRASE);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain(CUST);
  });

  it('passes a fee-bumped purchase: customer signed the debt, shop signed the fee', () => {
    expect(verifyEnvelope(xdr(purchase([cust], shop)), NETWORK_PASSPHRASE).ok).toBe(true);
  });

  it('flags a purchase whose inner transaction the customer did not sign', () => {
    const r = verifyEnvelope(xdr(purchase([other], shop)), NETWORK_PASSPHRASE);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('inner transaction');
    expect(r.problems[0]).toContain(CUST);
  });

  it('flags a fee bump the shop did not sign', () => {
    const r = verifyEnvelope(xdr(purchase([cust], null)), NETWORK_PASSPHRASE);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('fee payer');
  });

  it('flags a hash that does not match the envelope (a swapped record)', () => {
    const a = purchase([cust], shop);
    const b = repayCash({ shop: new Account(SHOP, '9'), customer: CUST, amount: '10' });
    b.sign(shop);
    const r = verifyEnvelope(xdr(a), NETWORK_PASSPHRASE, hex(b.hash()));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('hash mismatch');
  });

  it('flags every signature when checked against the wrong network', () => {
    const r = verifyEnvelope(xdr(purchase([cust], shop)), Networks.PUBLIC);
    expect(r.ok).toBe(false);
  });

  it('reports garbage instead of throwing', () => {
    expect(verifyEnvelope('not-an-envelope', NETWORK_PASSPHRASE)).toMatchObject({ ok: false });
  });
});

describe('verifyExport', () => {
  const mk = (t: Transaction | FeeBumpTransaction, successful: boolean) => ({ hash: hex(t.hash()), createdAt: '2026-10-06T00:00:00Z', successful, memo: '', envelopeXdr: xdr(t) });

  it('counts successes and refusals, and lists only the broken ones', () => {
    const file: BookExport = {
      account: SHOP,
      network: 'testnet',
      passphrase: NETWORK_PASSPHRASE,
      exportedAt: '2026-10-06T00:00:00Z',
      transactions: [mk(join([shop, cust]), true), mk(purchase([cust], shop), false), mk(purchase([other], shop), true)],
    };
    const r = verifyExport(file);
    expect(r).toMatchObject({ total: 3, successful: 2, refused: 1 });
    expect(r.problems).toHaveLength(1);
  });

  it('verifies the REAL signed envelopes captured from testnet, offline', () => {
    const txs = [...fixture.payments.shopA, ...fixture.payments.shopB, ...fixture.payments.customer].flatMap((p) => {
      const t = (p as unknown as { transaction?: { hash: string; envelope_xdr: string; successful: boolean; created_at: string } }).transaction;
      return t ? [{ hash: t.hash, createdAt: t.created_at, successful: t.successful, memo: '', envelopeXdr: t.envelope_xdr }] : [];
    });
    const unique = [...new Map(txs.map((t) => [t.hash, t])).values()];
    expect(unique.length).toBeGreaterThan(8);
    const r = verifyExport({ account: fixture.accounts.shopA, network: 'testnet', passphrase: NETWORK_PASSPHRASE, exportedAt: fixture.capturedAt, transactions: unique });
    expect(r.problems).toEqual([]);
  });

  it('catches tampering in a real envelope: swap one real signed purchase for another real one', () => {
    const real = fixture.payments.customer.find((p) => p.type === 'payment' && p.from === fixture.accounts.customer);
    const other2 = fixture.payments.customer.filter((p) => p.type === 'payment' && p.from === fixture.accounts.customer)[1];
    const a = (real as unknown as { transaction: { hash: string; envelope_xdr: string } }).transaction;
    const b = (other2 as unknown as { transaction: { envelope_xdr: string } }).transaction;
    const r = verifyEnvelope(b.envelope_xdr, NETWORK_PASSPHRASE, a.hash); // right envelope shape, wrong hash
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('hash mismatch');
  });
});

describe('who must sign', () => {
  it('an unsigned join names both accounts that should have signed: the shop (source) and the customer (op source)', () => {
    const r = verifyEnvelope(xdr(join([])), NETWORK_PASSPHRASE);
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(2);
    expect(r.problems.join(' ')).toContain(SHOP);
    expect(r.problems.join(' ')).toContain(CUST);
  });
});
