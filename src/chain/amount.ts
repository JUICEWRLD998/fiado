// Stellar amounts are decimal strings with at most 7 places.
const AMOUNT_RE = /^(0|[1-9]\d{0,11})(\.\d{1,7})?$/;
const STROOPS = 10_000_000n;

export class AmountError extends Error {}

/** Validates a positive amount and returns it in canonical form (no trailing zeros). */
export function toAmount(input: string | number): string {
  const s = typeof input === 'number' ? input.toFixed(7) : input.trim();
  if (!AMOUNT_RE.test(s)) throw new AmountError(`not a valid amount: "${input}"`);
  const stroops = toStroops(s);
  if (stroops <= 0n) throw new AmountError('amount must be greater than zero');
  return fromStroops(stroops);
}

export function toStroops(amount: string): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  return BigInt(whole) * STROOPS + BigInt((frac + '0000000').slice(0, 7));
}

export function fromStroops(stroops: bigint): string {
  const whole = stroops / STROOPS;
  const frac = (stroops % STROOPS).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
