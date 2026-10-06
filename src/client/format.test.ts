import { describe, expect, it } from 'vitest';
import { daysFromNow, formatAmount, formatDate, parseMoney, shortKey } from './format';
import { toStroops } from '../chain/amount';

const S = (n: string) => toStroops(n);

describe('formatAmount', () => {
  it('groups thousands and drops empty decimals', () => {
    expect(formatAmount(S('3200'), '₦')).toBe('₦3,200');
    expect(formatAmount(S('1234567'), '₦')).toBe('₦1,234,567');
    expect(formatAmount(S('0'), 'S/')).toBe('S/0');
    expect(formatAmount(S('999'), 'R$')).toBe('R$999');
  });
  it('keeps two decimals when there is a fraction', () => {
    expect(formatAmount(S('3200.5'), '₦')).toBe('₦3,200.50');
    expect(formatAmount(S('0.05'), '$')).toBe('$0.05');
    expect(formatAmount(S('12.34'), '$')).toBe('$12.34');
  });
  it('shows a negative amount with its sign in front', () => {
    expect(formatAmount(-S('1500'), '₦')).toBe('-₦1,500');
  });
});

describe('parseMoney', () => {
  it('accepts whole amounts and at most two decimals, and returns the canonical chain amount', () => {
    expect(parseMoney('3200')).toBe('3200');
    expect(parseMoney(' 3200.50 ')).toBe('3200.5');
    expect(parseMoney('0.05')).toBe('0.05');
  });
  it('refuses zero, negatives, three decimals, commas, text and the empty string', () => {
    for (const bad of ['0', '0.00', '-5', '1.234', '1,000', 'abc', '', '  ', '1e3', '.5', '5.']) expect(parseMoney(bad), bad).toBeNull();
  });
});

describe('dates and keys', () => {
  it('formats a due date without depending on the locale', () => {
    expect(formatDate('2026-10-20')).toBe('20 Oct 2026');
    expect(formatDate('2026-01-05')).toBe('5 Jan 2026');
    expect(formatDate('garbage')).toBe('garbage');
  });
  it('counts days in UTC', () => {
    expect(daysFromNow(7, new Date('2026-10-06T23:59:00Z'))).toBe('2026-10-13');
  });
  it('shortens a key', () => {
    expect(shortKey('GDGA47F3RSCWUTBIRU7RREAS4EW5L3KY44R3ZELAJNSXFCCEITN6Y4ZT')).toBe('GDGA…Y4ZT');
  });
});
