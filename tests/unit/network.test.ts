// Guard for the hard rule "testnet only": no mainnet passphrase or mainnet Horizon URL may
// appear anywhere in the app source. The planted control proves the scan can see a hit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MAINNET = [/Public Global Stellar Network/, /horizon\.stellar\.org/, /Networks\.PUBLIC/];
const ROOTS = ['src', 'app'];

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const hits = (text: string) => MAINNET.filter((re) => re.test(text)).map(String);

describe('testnet only', () => {
  it('planted control: the scanner flags a mainnet reference', () => {
    expect(hits("const u = 'https://horizon.stellar.org'")).not.toHaveLength(0);
    expect(hits("const u = 'https://horizon-testnet.stellar.org'")).toHaveLength(0);
  });

  it('no app source file references mainnet', () => {
    const scanned = ROOTS.flatMap(files);
    expect(scanned.length).toBeGreaterThan(0);
    const offenders = scanned.filter((f) => hits(readFileSync(f, 'utf8')).length > 0);
    expect(offenders).toEqual([]);
  });
});
