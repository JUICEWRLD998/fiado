// Shared by the book and record tests: the real captured Horizon fixture, and a synthetic movement builder.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toStroops } from '../chain/amount';
import type { Movement, RawAccount, RawPayment } from './movements';

export type Fixture = {
  capturedAt: string;
  accounts: { shopA: string; shopB: string; customer: string; rogue: string };
  payments: { shopA: RawPayment[]; shopB: RawPayment[]; customer: RawPayment[] };
  accounts_raw: { shopA: RawAccount; shopB: RawAccount; customer: RawAccount; rogue: RawAccount };
  lines: { shopA: { owed: string; limit: string }; shopB: { owed: string; limit: string } };
  expect: {
    shopA: { owed: string; purchases: string; repaid: string; forgiven: string; transferredOut: string };
    shopB: { owed: string; purchases: string; repaid: string; transferredIn: string };
    customer: { issued: string; repaid: string; forgiven: string; open: string; shops: number };
  };
};

export const fixture: Fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tests/fixtures/lifecycle.json', import.meta.url)), 'utf8'),
);

/** Whole currency units to stroops. */
export const S = (units: number | string) => toStroops(String(units));

let counter = 0;

/** A synthetic movement. Ids increase in call order, like Horizon paging tokens. */
export function mv(p: { customer: string; from: string; to: string; amount: number; at: string; memo?: string }): Movement {
  counter += 1;
  return { id: String(1_000_000 + counter), hash: `h${counter}`, at: p.at, customer: p.customer, from: p.from, to: p.to, amount: S(p.amount), memo: p.memo ?? '' };
}
