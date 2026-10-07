import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { REAL_SHOPS, validateRegistry, type RegisteredShop } from './registry';

const good = (over: Partial<RegisteredShop> = {}): RegisteredShop => ({
  pub: Keypair.random().publicKey(),
  firstName: 'Ada',
  city: 'Lagos',
  consentedOn: '2026-10-09',
  ...over,
});

describe('validateRegistry', () => {
  it('the shipped registry is valid', () => {
    expect(validateRegistry(REAL_SHOPS)).toEqual([]);
  });
  it('accepts a complete entry (positive control)', () => {
    expect(validateRegistry([good()])).toEqual([]);
  });
  it('rejects each kind of bad entry (planted)', () => {
    expect(validateRegistry([good({ pub: 'GNOTAKEY' })])[0]).toMatch(/not a Stellar address/);
    expect(validateRegistry([good({ firstName: 'Ada Obi' })])[0]).toMatch(/first name only/);
    expect(validateRegistry([good({ firstName: '' })])[0]).toMatch(/first name only/);
    expect(validateRegistry([good({ city: ' ' })])[0]).toMatch(/city is missing/);
    expect(validateRegistry([good({ consentedOn: '2026-13-40' })])[0]).toMatch(/consent date/);
    expect(validateRegistry([good({ consentedOn: '' })])[0]).toMatch(/consent date/);
    expect(validateRegistry([good({ city: 'Demo town' })])[0]).toMatch(/demo data/);
  });
  it('rejects the same shop twice', () => {
    const a = good();
    expect(validateRegistry([a, { ...a }])[0]).toMatch(/listed twice/);
  });
});
