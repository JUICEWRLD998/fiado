import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../chain/hex';
import { hkdf, keypairFromSeed, prfSalt, seedFromPrf } from './derive';

const bytes = (hex: string) => (hex === '' ? new Uint8Array(0) : fromHex(hex));

describe('hkdf against the RFC 5869 test vectors (so our WebCrypto usage is known-correct)', () => {
  it('test case 1: basic, with salt and info', async () => {
    const okm = await hkdf(bytes('0b'.repeat(22)), bytes('000102030405060708090a0b0c'), bytes('f0f1f2f3f4f5f6f7f8f9'), 42);
    expect(toHex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });

  it('test case 3: zero-length salt and info', async () => {
    const okm = await hkdf(bytes('0b'.repeat(22)), bytes(''), bytes(''), 42);
    expect(toHex(okm)).toBe('8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8');
  });
});

describe('passkey to Stellar key', () => {
  const prf = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

  it('is deterministic: the same passkey output always gives the same account', async () => {
    const a = keypairFromSeed(await seedFromPrf(prf, 'shop')).publicKey();
    const b = keypairFromSeed(await seedFromPrf(prf, 'shop')).publicKey();
    expect(a).toBe(b);
    expect(a).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('gives a shop and a customer unrelated keys from one passkey', async () => {
    const shop = keypairFromSeed(await seedFromPrf(prf, 'shop')).publicKey();
    const cust = keypairFromSeed(await seedFromPrf(prf, 'customer')).publicKey();
    expect(shop).not.toBe(cust);
  });

  it('a different passkey output gives a different account', async () => {
    const other = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
    expect(keypairFromSeed(await seedFromPrf(other, 'shop')).publicKey()).not.toBe(keypairFromSeed(await seedFromPrf(prf, 'shop')).publicKey());
  });

  it('pins a known answer, so a refactor can never silently change everyone’s account', async () => {
    const seed = await seedFromPrf(prf, 'shop');
    expect(toHex(seed)).toBe(PINNED_SEED);
    expect(keypairFromSeed(seed).publicKey()).toBe(PINNED_PUB);
  });

  it('refuses a PRF output or seed of the wrong length', async () => {
    await expect(seedFromPrf(new Uint8Array(31), 'shop')).rejects.toThrow(/32/);
    expect(() => keypairFromSeed(new Uint8Array(16))).toThrow(/32/);
  });

  it('uses a distinct salt per role', () => {
    expect(new TextDecoder().decode(prfSalt('shop'))).toBe('fiado-key-v1/shop');
    expect(new TextDecoder().decode(prfSalt('customer'))).toBe('fiado-key-v1/customer');
  });
});

// Computed independently with node:crypto HKDF (not through derive.ts) for prf = bytes 1..32, role "shop".
const PINNED_SEED = '20fcb9905bfac17bbf656636cc801d916e92330af7161d06a2745d421ee55167';
const PINNED_PUB = 'GCJ2DFWB6FHGUSEOMLEZWN7UOGDKQAQPPJ4AY6S6U4GUOXULANRUIUB7';
