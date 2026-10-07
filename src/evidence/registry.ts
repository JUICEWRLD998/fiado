// The shops listed on /evidence: real shopkeepers who agreed, in writing, to be named. This list is the only thing
// that puts a shop on that page, so a shop cannot appear without an entry that carries its consent date.
//
// Everything else on the page is read live from the Stellar test network. A key here is a public address; there
// is no secret in this file. Demo shops from /try are never listed: they are made fresh in the visitor's browser.
//
// Add an entry only after the shopkeeper has said yes to the first name and city shown (Phase 9).

import { StrKey } from '@stellar/stellar-sdk';

export type RegisteredShop = {
  /** The shop's Stellar public key. */
  pub: string;
  /** First name only, as the shopkeeper agreed. */
  firstName: string;
  city: string;
  /** The day they agreed to be listed, YYYY-MM-DD. */
  consentedOn: string;
};

export const REAL_SHOPS: readonly RegisteredShop[] = [];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEMO_WORDS = /demo|sandbox|test|example|sample/i;

/** Problems with a registry, in words. An empty array means every entry can be shown. */
export function validateRegistry(shops: readonly RegisteredShop[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  shops.forEach((s, i) => {
    const at = `entry ${i + 1}`;
    if (!StrKey.isValidEd25519PublicKey(s.pub)) problems.push(`${at}: "${s.pub}" is not a Stellar address`);
    if (seen.has(s.pub)) problems.push(`${at}: ${s.pub} is listed twice`);
    seen.add(s.pub);
    if (!s.firstName.trim() || /\s/.test(s.firstName.trim())) problems.push(`${at}: first name only, one word`);
    if (!s.city.trim()) problems.push(`${at}: city is missing`);
    if (!DAY.test(s.consentedOn) || Number.isNaN(Date.parse(s.consentedOn))) problems.push(`${at}: consent date must be a real YYYY-MM-DD`);
    if (DEMO_WORDS.test(s.firstName) || DEMO_WORDS.test(s.city)) problems.push(`${at}: looks like demo data, which never goes on /evidence`);
  });
  return problems;
}
