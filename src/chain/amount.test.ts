import { describe, expect, it } from 'vitest';
import { AmountError, fromStroops, toAmount, toStroops } from './amount';

describe('toAmount', () => {
  it('accepts whole and decimal amounts and canonicalises them', () => {
    expect(toAmount('3200')).toBe('3200');
    expect(toAmount('3200.50')).toBe('3200.5');
    expect(toAmount('0.0000001')).toBe('0.0000001');
    expect(toAmount(1500)).toBe('1500');
  });

  it('refuses zero, negatives, too many decimals and junk', () => {
    for (const bad of ['0', '0.0000000', '-5', '1.00000001', 'abc', '', '01', '1e3']) {
      expect(() => toAmount(bad), bad).toThrow(AmountError);
    }
  });
});

describe('stroops', () => {
  it('round-trips exactly, with no float error', () => {
    expect(toStroops('0.1')).toBe(1_000_000n);
    expect(fromStroops(toStroops('1234.5678901'))).toBe('1234.5678901');
    expect(fromStroops(toStroops('0.1') + toStroops('0.2'))).toBe('0.3');
  });
});
