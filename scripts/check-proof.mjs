// Asks the Stellar test network whether every claim on /how still holds. Read-only: no key, no signature.
//   npm run check:proof
// Exit 0 = every claim matches the ledger. Exit 1 = a claim is wrong, or the checker itself is blind.

import { xdr } from '@stellar/stellar-sdk';
import { CLAIMS } from '../src/proof/claims.ts';

const HORIZON = 'https://horizon-testnet.stellar.org';

async function get(path) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${HORIZON}${path}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Horizon ${r.status} for ${path}`);
      return await r.json();
    } catch (err) {
      if (i >= 3) throw err;
      await new Promise((res) => setTimeout(res, 1000 * i));
    }
  }
}

/** Returns the ways `tx.expect` disagrees with the ledger. Empty = it matches. */
async function mismatches(tx) {
  const t = await get(`/transactions/${tx.hash}`);
  if (!t) return [`transaction ${tx.hash.slice(0, 8)} is not on the ledger`];
  const e = tx.expect;
  const bad = [];
  if (t.successful !== e.successful) bad.push(`successful is ${t.successful}, claim says ${e.successful}`);
  const ops = ((await get(`/transactions/${tx.hash}/operations?limit=200`))?._embedded.records ?? []).map((o) => o.type);
  if (JSON.stringify(ops) !== JSON.stringify(e.ops)) bad.push(`operations are [${ops}], claim says [${e.ops}]`);
  if (e.feeBump !== undefined) {
    // In a fee-bump, `source_account` is the inner signer (the customer) and `fee_account` is who paid (the shop).
    const bumped = Boolean(t.fee_bump_transaction) && t.fee_account !== t.source_account;
    if (bumped !== e.feeBump) bad.push(`fee-bump is ${bumped}, claim says ${e.feeBump}`);
  }
  if (e.memo !== undefined && t.memo !== e.memo) bad.push(`memo is "${t.memo}", claim says "${e.memo}"`);
  if (e.code !== undefined) {
    // A recorded transaction carries its result as XDR (Horizon only gives result_codes at submit time). Its JSON form
    // names each operation's outcome without the "op_" prefix, e.g. {"payment":"line_full"}.
    const decoded = JSON.stringify(xdr.TransactionResult.fromXDR(t.result_xdr, 'base64'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (!decoded.includes(`"${e.code.replace(/^op_/, '')}"`)) bad.push(`result is ${decoded}, claim says ${e.code}`);
  }
  return bad;
}

async function main() {
  let failed = 0;

  // Planted control: a claim that is deliberately wrong must be reported wrong. If it is not, this checker is blind.
  const real = CLAIMS.find((c) => c.tx);
  const planted = await mismatches({ hash: real.tx.hash, expect: { ...real.tx.expect, successful: !real.tx.expect.successful } });
  if (planted.length === 0) {
    console.error('FAIL  planted control: a wrong claim was not caught, so this checker proves nothing');
    process.exit(1);
  }
  console.log(`PASS  planted control: a wrong claim is caught (${planted[0]})`);
  const refused = CLAIMS.find((c) => c.tx?.expect.code);
  const wrongCode = await mismatches({ hash: refused.tx.hash, expect: { ...refused.tx.expect, code: 'op_underfunded' } });
  if (wrongCode.length === 0) {
    console.error('FAIL  planted control: a wrong result code was not caught, so this checker proves nothing');
    process.exit(1);
  }
  console.log('PASS  planted control: a wrong result code is caught');

  for (const c of CLAIMS) {
    if (c.tx) {
      const bad = await mismatches(c.tx);
      if (bad.length) {
        failed++;
        console.error(`FAIL  ${c.id} ${c.tx.hash.slice(0, 8)}: ${bad.join('; ')}`);
      } else console.log(`PASS  ${c.id}: ${c.tx.hash.slice(0, 8)} matches the ledger`);
    }
    if (c.record) {
      const a = await get(`/accounts/${c.record}`);
      if (!a || a.flags?.auth_required !== true) {
        failed++;
        console.error(`FAIL  ${c.id}: ${c.record.slice(0, 8)} is not a Fiado customer account on the ledger`);
      } else console.log(`PASS  ${c.id}: ${c.record.slice(0, 8)} is a Fiado customer account (approval required)`);
    }
    if (c.reproduce) console.log(`NOTE  ${c.id}: not on the ledger; reproduce with \`${c.reproduce.command}\``);
  }
  if (failed) {
    console.error(`\n${failed} claim(s) do not match the ledger`);
    process.exit(1);
  }
  console.log('\nevery claim on /how matches the Stellar test network');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
