// The browser calls: create a passkey, and ask it for its PRF secret. Browser only.

import { prfSalt, type Role } from './derive';

export class PasskeyError extends Error {}
/** This device or browser can make a passkey but cannot compute the PRF secret Fiado needs. */
export class PrfUnsupportedError extends PasskeyError {}

export const passkeysAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && typeof navigator.credentials !== 'undefined';

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function friendly(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
  if (name === 'NotSupportedError') return 'This device does not support passkeys.';
  if (name === 'SecurityError') return 'Passkeys need a secure address (https, or localhost).';
  return e instanceof Error ? e.message : String(e);
}

type PrfOutputs = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

/** Creates a discoverable passkey for the role and returns its credential id. Throws PrfUnsupportedError if it cannot do PRF. */
export async function createPasskey(role: Role): Promise<Uint8Array> {
  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Fiado' },
        user: { id: random(16), name: `fiado-${role}`, displayName: `Fiado ${role}` },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: { eval: { first: prfSalt(role).slice() } } },
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw new PasskeyError(friendly(e));
  }
  if (!cred) throw new PasskeyError('No passkey was created.');
  const out = cred.getClientExtensionResults() as PrfOutputs;
  if (!out.prf?.enabled && !out.prf?.results?.first) {
    throw new PrfUnsupportedError('This device can store a passkey but cannot use it to hold a Fiado key.');
  }
  return new Uint8Array(cred.rawId);
}

/** Asks the passkey for its 32-byte PRF secret for this role. Prompts the person to verify. */
export async function readPrf(role: Role, credentialId?: Uint8Array): Promise<Uint8Array> {
  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        userVerification: 'required',
        ...(credentialId ? { allowCredentials: [{ type: 'public-key' as const, id: credentialId.slice() }] } : {}),
        extensions: { prf: { eval: { first: prfSalt(role).slice() } } },
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw new PasskeyError(friendly(e));
  }
  const first = (assertion?.getClientExtensionResults() as PrfOutputs | undefined)?.prf?.results?.first;
  if (!first || first.byteLength !== 32) throw new PrfUnsupportedError('This passkey did not return the secret Fiado needs.');
  return new Uint8Array(first);
}
