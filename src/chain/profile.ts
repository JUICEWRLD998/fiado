// Display names live on-chain as account data entries, so the shop's book and the customer's record
// stay readable without any database. Stellar data values are at most 64 bytes.

export const MAX_NAME_BYTES = 40;
export const MAX_CURRENCY_BYTES = 8;
export const NAME_KEY = 'name';
export const CURRENCY_KEY = 'currency';
export const DEFAULT_CURRENCY = '₦';

export class ProfileError extends Error {}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** A person's or shop's display name: collapsed whitespace, no control characters, at most 40 UTF-8 bytes. */
export function cleanName(raw: string): string {
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s) throw new ProfileError('name is empty');
  if (/[\u0000-\u001f\u007f]/.test(s)) throw new ProfileError('name contains control characters');
  if (bytes(s) > MAX_NAME_BYTES) throw new ProfileError(`name is ${bytes(s)} bytes; the limit is ${MAX_NAME_BYTES}`);
  return s;
}

/** A currency symbol such as ₦, S/, R$ or $: no spaces, at most 8 UTF-8 bytes. */
export function cleanCurrency(raw: string): string {
  const s = raw.normalize('NFC').trim();
  if (!s) throw new ProfileError('currency is empty');
  if (/\s/.test(s)) throw new ProfileError('currency must not contain spaces');
  if (bytes(s) > MAX_CURRENCY_BYTES) throw new ProfileError(`currency is ${bytes(s)} bytes; the limit is ${MAX_CURRENCY_BYTES}`);
  return s;
}

/** Decode a Horizon `data_attr` value (base64 of the stored bytes) to text. */
export function decodeData(b64: string | undefined): string | null {
  if (!b64) return null;
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
