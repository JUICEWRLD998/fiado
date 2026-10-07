import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { CLAIMS, explorerAccount, explorerTx } from './claims';

describe('the claims on /how', () => {
  it('every claim has a unique id and says what it proves, in words', () => {
    expect(new Set(CLAIMS.map((c) => c.id)).size).toBe(CLAIMS.length);
    for (const c of CLAIMS) {
      expect(c.claim.length).toBeGreaterThan(10);
      expect(c.plain.length).toBeGreaterThan(40);
      expect(c.look.length).toBeGreaterThan(10);
    }
  });

  it('every claim can be checked: a ledger transaction, a record, or a command', () => {
    for (const c of CLAIMS) expect(Boolean(c.tx) || Boolean(c.record) || Boolean(c.reproduce), c.id).toBe(true);
  });

  it('every transaction hash is 64 hex characters and appears once', () => {
    const hashes = CLAIMS.flatMap((c) => (c.tx ? [c.tx.hash] : []));
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('every linked address is a valid Stellar address', () => {
    for (const c of CLAIMS) if (c.record) expect(StrKey.isValidEd25519PublicKey(c.record), c.id).toBe(true);
  });

  it('a claim that is not on the ledger says why, and gives a command', () => {
    for (const c of CLAIMS.filter((x) => x.reproduce)) {
      expect(c.reproduce!.command).toMatch(/^npm /);
      expect(c.reproduce!.why.length).toBeGreaterThan(10);
    }
  });

  it('explorer links go to the test network, never the public one', () => {
    expect(explorerTx('a'.repeat(64))).toBe(`https://stellar.expert/explorer/testnet/tx/${'a'.repeat(64)}`);
    expect(explorerAccount('GX')).toContain('/explorer/testnet/');
  });
});
