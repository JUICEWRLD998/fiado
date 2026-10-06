// Export an account's history with its full signed envelopes, and verify an export offline.
//
//   node scripts/export-book.mjs <G... account> [--out file.json]     fetch from testnet Horizon, verify, save
//   node scripts/export-book.mjs --verify file.json                    verify a saved export; needs no network
//
// Exit code 0 only if every signature checks out. Testnet only.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { verifyExport } from '../src/book/export.ts';

const HORIZON = 'https://horizon-testnet.stellar.org';
const PASSPHRASE = 'Test SDF Network ; September 2015';

const args = process.argv.slice(2);

function report(file) {
  const r = verifyExport(file);
  console.log(`account  ${file.account}`);
  console.log(`network  ${file.network} (${file.passphrase})`);
  console.log(`txs      ${r.total} (${r.successful} successful, ${r.refused} refused by the network)`);
  if (r.problems.length === 0) {
    console.log(`verified every signature offline: OK`);
    return 0;
  }
  for (const p of r.problems) console.log(`PROBLEM ${p.hash}\n  ${p.problems.join('\n  ')}`);
  console.log(`verification FAILED for ${r.problems.length} of ${r.total}`);
  return 1;
}

async function fetchExport(account) {
  const transactions = new Map();
  let url = `${HORIZON}/accounts/${account}/payments?join=transactions&include_failed=true&order=asc&limit=200`;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`horizon ${res.status} for ${url}`);
    const body = await res.json();
    const records = body._embedded.records;
    if (records.length === 0) break;
    for (const rec of records) {
      const t = rec.transaction;
      if (!t || transactions.has(t.hash)) continue;
      transactions.set(t.hash, {
        hash: t.hash,
        createdAt: t.created_at,
        successful: t.successful,
        memo: t.memo_type === 'text' && t.memo ? t.memo : '',
        envelopeXdr: t.envelope_xdr,
      });
    }
    url = body._links.next.href;
  }
  return { account, network: 'testnet', passphrase: PASSPHRASE, exportedAt: new Date().toISOString(), transactions: [...transactions.values()] };
}

if (args[0] === '--verify') {
  if (!args[1]) throw new Error('usage: --verify <file.json>');
  process.exit(report(JSON.parse(readFileSync(args[1], 'utf8'))));
} else if (/^G[A-Z2-7]{55}$/.test(args[0] ?? '')) {
  const file = await fetchExport(args[0]);
  const outIdx = args.indexOf('--out');
  const out = outIdx > -1 ? args[outIdx + 1] : `exports/${args[0]}.json`;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n');
  console.log(`saved ${out}`);
  process.exit(report(file));
} else {
  console.error('usage: export-book.mjs <G... account> [--out file] | --verify <file>');
  process.exit(2);
}
