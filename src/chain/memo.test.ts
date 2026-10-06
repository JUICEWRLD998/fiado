import { describe, expect, it } from 'vitest';
import { decodeNote, encodeNote, MAX_ITEM_BYTES_WITH_DUE, MEMO_MAX_BYTES, MemoError } from './memo';

describe('purchase memo', () => {
  it('encodes item and due date in the fixed format', () => {
    expect(encodeNote({ item: 'Rice 2 bags', due: '2026-10-20' })).toBe('Rice 2 bags|261020');
    expect(encodeNote({ item: 'Bread' })).toBe('Bread');
  });

  it('round-trips', () => {
    const note = { item: 'Cement 3 bags', due: '2026-11-01' };
    expect(decodeNote(encodeNote(note))).toEqual(note);
    expect(decodeNote('Bread')).toEqual({ item: 'Bread' });
  });

  it('never lets a pipe in the item fake a due date', () => {
    const memo = encodeNote({ item: 'Oil|261020' });
    expect(memo).toBe('Oil/261020');
    expect(decodeNote(memo)).toEqual({ item: 'Oil/261020' });
  });

  it('enforces the 28-byte Stellar text memo limit, counting UTF-8 bytes', () => {
    const fits = 'x'.repeat(MAX_ITEM_BYTES_WITH_DUE);
    expect(new TextEncoder().encode(encodeNote({ item: fits, due: '2026-10-20' })).length).toBe(MEMO_MAX_BYTES);
    expect(() => encodeNote({ item: fits + 'x', due: '2026-10-20' })).toThrow(MemoError);
    // "₦" is 3 bytes: 10 of them are 30 bytes, over the limit although only 10 characters.
    expect(() => encodeNote({ item: '₦'.repeat(10) })).toThrow(MemoError);
  });

  it('rejects an empty item and a malformed date', () => {
    expect(() => encodeNote({ item: '  ' })).toThrow(MemoError);
    expect(() => encodeNote({ item: 'Rice', due: '20/10/2026' })).toThrow(MemoError);
  });
});
