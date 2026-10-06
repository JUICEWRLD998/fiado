// Turning a passkey into a Stellar key, with no seed phrase to write down.
//
// A passkey that supports the WebAuthn PRF extension can compute a secret from a fixed input. We feed
// it a fixed, role-specific salt, stretch the 32-byte answer with HKDF, and use the result as an
// ed25519 seed. The same passkey always yields the same key; the key never exists anywhere else.

import { Keypair } from '@stellar/stellar-sdk';

export type Role = 'shop' | 'customer';

export const PRF_SALT_PREFIX = 'fiado-key-v1';

/** The fixed PRF input for a role. A shop key and a customer key from one passkey are unrelated. */
export const prfSalt = (role: Role): Uint8Array => new TextEncoder().encode(`${PRF_SALT_PREFIX}/${role}`);

/** HKDF-SHA256 (RFC 5869) through WebCrypto. */
export async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm.slice(), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt.slice(), info: info.slice() }, key, length * 8);
  return new Uint8Array(bits);
}

/** 32 PRF bytes in, a 32-byte ed25519 seed out. */
export async function seedFromPrf(prf: Uint8Array, role: Role): Promise<Uint8Array> {
  if (prf.length !== 32) throw new Error(`expected 32 PRF bytes, got ${prf.length}`);
  return hkdf(prf, new Uint8Array(32), new TextEncoder().encode(`fiado/ed25519/${role}`), 32);
}

export function keypairFromSeed(seed: Uint8Array): Keypair {
  if (seed.length !== 32) throw new Error(`an ed25519 seed is 32 bytes, got ${seed.length}`);
  return Keypair.fromRawEd25519Seed(seed as never);
}
