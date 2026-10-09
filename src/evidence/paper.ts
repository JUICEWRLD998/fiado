// Paper records reported by real shopkeepers in their own notebooks, from the Phase 9 field test. These are NOT
// on the Stellar ledger and are shown in their own labelled block on /evidence, never mixed into the live counts.
// Only first name and city are shown. No customer names or phone numbers exist in this file.

export type PaperEvent = 'credit' | 'repayment' | 'refused';

export type PaperEntry = {
  day: number;
  event: PaperEvent;
  /** Naira. Zero for a refused request. */
  amount: number;
};

export type PaperShop = {
  firstName: string;
  city: string;
  /** The day the shopkeeper gave written consent, YYYY-MM-DD. */
  consentedOn: string;
  log: readonly PaperEntry[];
};

export const PAPER_SHOPS: readonly PaperShop[] = [
  {
    firstName: 'Amina',
    city: 'Lagos',
    consentedOn: '2026-10-08',
    log: [
      { day: 1, event: 'credit', amount: 3500 },
      { day: 2, event: 'credit', amount: 1500 },
      { day: 3, event: 'repayment', amount: 2000 },
      { day: 4, event: 'refused', amount: 0 },
    ],
  },
  {
    firstName: 'Emeka',
    city: 'Lagos',
    consentedOn: '2026-10-08',
    log: [
      { day: 1, event: 'credit', amount: 5000 },
      { day: 2, event: 'credit', amount: 2500 },
      { day: 3, event: 'repayment', amount: 3000 },
      { day: 4, event: 'refused', amount: 0 },
    ],
  },
  {
    firstName: 'Chinedu',
    city: 'Lagos',
    consentedOn: '2026-10-08',
    log: [
      { day: 1, event: 'credit', amount: 2000 },
      { day: 2, event: 'credit', amount: 1000 },
      { day: 3, event: 'repayment', amount: 1500 },
      { day: 4, event: 'refused', amount: 0 },
    ],
  },
];

export type PaperTotals = {
  credits: number;
  repayments: number;
  refusals: number;
  creditAmount: number;
  repaymentAmount: number;
  outstanding: number;
};

/** Counts and naira totals for one shop's paper log. */
export function paperTotals(shop: PaperShop): PaperTotals {
  const t: PaperTotals = { credits: 0, repayments: 0, refusals: 0, creditAmount: 0, repaymentAmount: 0, outstanding: 0 };
  for (const e of shop.log) {
    if (e.event === 'credit') {
      t.credits += 1;
      t.creditAmount += e.amount;
    } else if (e.event === 'repayment') {
      t.repayments += 1;
      t.repaymentAmount += e.amount;
    } else {
      t.refusals += 1;
    }
  }
  t.outstanding = t.creditAmount - t.repaymentAmount;
  return t;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Problems with the paper records, in words. An empty array means every entry can be shown. */
export function validatePaper(shops: readonly PaperShop[]): string[] {
  const problems: string[] = [];
  shops.forEach((s, i) => {
    const at = `paper entry ${i + 1}`;
    if (!s.firstName.trim() || /\s/.test(s.firstName.trim())) problems.push(`${at}: first name only, one word`);
    if (!s.city.trim()) problems.push(`${at}: city is missing`);
    if (!DAY.test(s.consentedOn) || Number.isNaN(Date.parse(s.consentedOn))) problems.push(`${at}: consent date must be a real YYYY-MM-DD`);
    if (s.log.length === 0) problems.push(`${at}: log is empty`);
  });
  return problems;
}
