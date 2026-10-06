import { describe, expect, it } from 'vitest';
import { ChainRefusal } from '../chain/horizon';
import { explainRefusal, isOverLimit } from './explain';

const refusal = (...ops: string[]) => new ChainRefusal({ transaction: 'tx_failed', operations: ops }, 'abc');
const bumped = (...ops: string[]) => new ChainRefusal({ transaction: 'tx_fee_bump_inner_failed', inner_transaction: 'tx_failed', operations: ops }, 'abc');

describe('explainRefusal', () => {
  it('says "over the credit limit" for op_line_full, for plain and fee-bumped transactions alike', () => {
    expect(explainRefusal(refusal('op_line_full'))).toMatch(/credit limit/);
    expect(explainRefusal(bumped('op_line_full'))).toMatch(/credit limit/);
    expect(isOverLimit(bumped('op_line_full'))).toBe(true);
    expect(isOverLimit(refusal('op_no_trust'))).toBe(false);
    expect(isOverLimit(new Error('x'))).toBe(false);
  });

  it('explains the other refusals Fiado can hit', () => {
    expect(explainRefusal(bumped('op_no_trust'))).toMatch(/no credit line/);
    expect(explainRefusal(bumped('op_not_authorized'))).toMatch(/not approved/);
    expect(explainRefusal(new ChainRefusal({ transaction: 'tx_bad_seq' }, 'h'))).toMatch(/try again/);
    expect(explainRefusal(new ChainRefusal({ transaction: 'tx_too_late' }, 'h'))).toMatch(/expired/);
    expect(explainRefusal(refusal('op_invalid_limit'))).toMatch(/lower than what is owed/);
  });

  it('never hides an unknown code: it is quoted so it can be reported', () => {
    expect(explainRefusal(refusal('op_something_new'))).toContain('op_something_new');
  });

  it('passes a plain Error message through and stringifies anything else', () => {
    expect(explainRefusal(new Error('network down'))).toBe('network down');
    expect(explainRefusal('boom')).toBe('boom');
  });
});
