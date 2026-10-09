import { describe, expect, it } from 'vitest';
import { PAPER_SHOPS, paperTotals, validatePaper } from './paper';

describe('paper records', () => {
  it('match the combined table the shopkeepers reported', () => {
    const all = PAPER_SHOPS.map(paperTotals);
    const sum = (k: keyof ReturnType<typeof paperTotals>) => all.reduce((n, t) => n + t[k], 0);
    expect(PAPER_SHOPS).toHaveLength(3);
    expect(sum('credits')).toBe(6);
    expect(sum('repayments')).toBe(3);
    expect(sum('refusals')).toBe(3);
    expect(sum('creditAmount')).toBe(15500);
    expect(sum('repaymentAmount')).toBe(6500);
    expect(sum('outstanding')).toBe(9000);
  });

  it('accepts the shipped data', () => {
    expect(validatePaper(PAPER_SHOPS)).toEqual([]);
  });

  it('rejects bad entries (planted control)', () => {
    const bad = [{ firstName: 'Two Words', city: '', consentedOn: '08/10/2026', log: [] }];
    expect(validatePaper(bad)).toHaveLength(4);
  });
});
