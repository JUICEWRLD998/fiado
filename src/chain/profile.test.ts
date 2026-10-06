import { describe, expect, it } from 'vitest';
import { cleanCurrency, cleanName, decodeData, MAX_NAME_BYTES, ProfileError } from './profile';
import { fromHex, toHex } from './hex';

describe('cleanName', () => {
  it('collapses whitespace and keeps unicode', () => {
    expect(cleanName('  Mama   Bisi  ')).toBe('Mama Bisi');
    expect(cleanName('José Núñez')).toBe('José Núñez');
  });

  it('rejects empty, control characters and anything over 40 UTF-8 bytes', () => {
    expect(() => cleanName('   ')).toThrow(ProfileError);
    expect(() => cleanName('a\u0000b')).toThrow(ProfileError);
    expect(cleanName('x'.repeat(MAX_NAME_BYTES))).toHaveLength(MAX_NAME_BYTES);
    expect(() => cleanName('x'.repeat(MAX_NAME_BYTES + 1))).toThrow(ProfileError);
    expect(() => cleanName('₦'.repeat(14))).toThrow(ProfileError); // 14 x 3 bytes = 42
  });
});

describe('cleanCurrency', () => {
  it('accepts the symbols we ship', () => {
    for (const c of ['₦', 'S/', 'R$', '$']) expect(cleanCurrency(c)).toBe(c);
  });
  it('rejects spaces and long values', () => {
    expect(() => cleanCurrency('N G')).toThrow(ProfileError);
    expect(() => cleanCurrency('NAIRAAAAAA')).toThrow(ProfileError);
    expect(() => cleanCurrency('')).toThrow(ProfileError);
  });
});

describe('decodeData', () => {
  it('decodes Horizon base64 data values, including multi-byte text', () => {
    expect(decodeData('TWFtYSBCaXNp')).toBe('Mama Bisi');
    expect(decodeData(btoa(String.fromCharCode(...new TextEncoder().encode('₦'))))).toBe('₦');
  });
  it('returns null for missing or invalid input', () => {
    expect(decodeData(undefined)).toBeNull();
    expect(decodeData('***')).toBeNull();
  });
});

describe('hex', () => {
  it('round-trips and rejects junk', () => {
    const b = Uint8Array.from([0, 1, 254, 255]);
    expect(toHex(b)).toBe('0001feff');
    expect(Array.from(fromHex('0001feff'))).toEqual(Array.from(b));
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });
});
