// Where a person's key lives. Two modes, chosen openly:
//
//  passkey : the key is computed from the passkey every time and stored nowhere. Losing the device does
//            not lose the account if the passkey syncs (iCloud Keychain, Google Password Manager).
//  device  : a random key kept in this browser's storage. Simple, but clearing the browser data loses it,
//            and any script on this site could read it. Offered for devices that cannot do PRF.
//
// Only a small description of the key (never a passkey secret) is kept in localStorage.

import { Keypair } from '@stellar/stellar-sdk';
import { fromHex, toHex } from '../chain/hex';
import { keypairFromSeed, seedFromPrf, type Role } from './derive';
import { createPasskey, PasskeyError, readPrf } from './webauthn';

export type Mode = 'passkey' | 'device';
export type Meta = { v: 1; mode: Mode; pub: string; credId?: string; seed?: string; name?: string; currency?: string };
export type KeyExtras = { name?: string; currency?: string };

const storageKey = (role: Role) => `fiado.${role}`;
const G_RE = /^G[A-Z2-7]{55}$/;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const toB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function readMeta(role: Role): Meta | null {
  try {
    const raw = store()?.getItem(storageKey(role));
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Meta>;
    if (m.v !== 1 || (m.mode !== 'passkey' && m.mode !== 'device') || typeof m.pub !== 'string' || !G_RE.test(m.pub)) return null;
    if (m.mode === 'passkey' && typeof m.credId !== 'string') return null;
    if (m.mode === 'device' && !(typeof m.seed === 'string' && /^[0-9a-f]{64}$/.test(m.seed))) return null;
    return m as Meta;
  } catch {
    return null;
  }
}

function writeMeta(role: Role, meta: Meta): void {
  const s = store();
  if (!s) throw new PasskeyError('This browser blocks storage, so Fiado cannot remember your key here.');
  s.setItem(storageKey(role), JSON.stringify(meta));
}

export function saveName(role: Role, name: string): void {
  const m = readMeta(role);
  if (m) writeMeta(role, { ...m, name });
}

export function forget(role: Role): void {
  store()?.removeItem(storageKey(role));
}

/** Creates the key and remembers who it belongs to, so an interrupted first run can be finished later. */
export async function createKey(role: Role, mode: Mode, extras: KeyExtras = {}): Promise<Keypair> {
  const keep = {
    ...(extras.name ? { name: extras.name } : {}),
    ...(extras.currency ? { currency: extras.currency } : {}),
  };
  if (mode === 'passkey') {
    const credId = await createPasskey(role);
    const kp = keypairFromSeed(await seedFromPrf(await readPrf(role, credId), role));
    writeMeta(role, { v: 1, mode, pub: kp.publicKey(), credId: toB64u(credId), ...keep });
    return kp;
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const kp = keypairFromSeed(seed);
  writeMeta(role, { v: 1, mode, pub: kp.publicKey(), seed: toHex(seed), ...keep });
  return kp;
}

/** The key for a role that already has one on this device. A passkey asks the person to verify. */
export async function unlock(role: Role): Promise<Keypair> {
  const meta = readMeta(role);
  if (!meta) throw new PasskeyError('There is no key on this device yet.');
  const kp =
    meta.mode === 'device'
      ? keypairFromSeed(fromHex(meta.seed!))
      : keypairFromSeed(await seedFromPrf(await readPrf(role, fromB64u(meta.credId!)), role));
  if (kp.publicKey() !== meta.pub) throw new PasskeyError('This is not the passkey that created this account.');
  return kp;
}
