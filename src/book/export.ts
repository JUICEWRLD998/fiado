// Offline proof for a book. A testnet reset wipes the ledger, but every transaction we exported
// carries its full signed envelope, so anyone can re-check from the file alone that each debt was
// signed by the customer it belongs to and each fee by the shop that paid it. No network needed.
//
// This file uses erasable TypeScript only (no enums, no parameter properties) so that
// `scripts/export-book.mjs` can import it directly under Node's type stripping.

import { FeeBumpTransaction, Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

export type ExportedTx = {
  hash: string;
  createdAt: string;
  successful: boolean;
  memo: string;
  envelopeXdr: string;
};

export type BookExport = {
  account: string;
  network: 'testnet';
  passphrase: string;
  exportedAt: string;
  transactions: ExportedTx[];
};

export type EnvelopeCheck = { hash: string; ok: boolean; problems: string[] };

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Does any signature on this level verify, under `hash`, for `publicKey`? */
function signedBy(publicKey: string, hash: Uint8Array, signatures: { signature: { value: Uint8Array } }[]): boolean {
  let kp: Keypair;
  try {
    kp = Keypair.fromPublicKey(publicKey);
  } catch {
    return false; // a muxed or non-ed25519 source: we do not claim to verify it
  }
  return signatures.some((s) => {
    try {
      return kp.verify(hash, s.signature.value);
    } catch {
      return false;
    }
  });
}

/** The accounts whose signature this transaction level needs: its source plus every operation source. */
function requiredKeys(tx: Transaction): string[] {
  const keys = new Set<string>([tx.source]);
  for (const op of tx.operations) if (op.source) keys.add(op.source);
  return [...keys];
}

/**
 * Re-derives the hash from the envelope and checks that every required account signed it.
 * For a fee-bump, the outer level needs the fee payer and the inner level needs the debtor.
 * Assumes accounts use their master key alone, which is true of every account Fiado creates.
 */
export function verifyEnvelope(envelopeXdr: string, passphrase: string, expectedHash?: string): EnvelopeCheck {
  const problems: string[] = [];
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(envelopeXdr, passphrase);
  } catch (e) {
    return { hash: '', ok: false, problems: [`not a valid envelope: ${(e as Error).message}`] };
  }
  const hash = toHex(parsed.hash());
  if (expectedHash && hash !== expectedHash) problems.push(`hash mismatch: envelope hashes to ${hash}, record says ${expectedHash}`);

  const level = (tx: Transaction, label: string) => {
    for (const key of requiredKeys(tx)) {
      if (!signedBy(key, tx.hash(), tx.signatures)) problems.push(`${label}: no valid signature from ${key}`);
    }
  };

  if (parsed instanceof FeeBumpTransaction) {
    if (!signedBy(parsed.feeSource, parsed.hash(), parsed.signatures)) problems.push(`fee bump: no valid signature from fee payer ${parsed.feeSource}`);
    level(parsed.innerTransaction, 'inner transaction');
  } else {
    level(parsed, 'transaction');
  }
  return { hash, ok: problems.length === 0, problems };
}

export type VerifyReport = { total: number; successful: number; refused: number; problems: { hash: string; problems: string[] }[] };

/** Verifies every transaction in an export. Never throws: a bad record is reported, not skipped. */
export function verifyExport(file: BookExport): VerifyReport {
  const report: VerifyReport = { total: file.transactions.length, successful: 0, refused: 0, problems: [] };
  for (const tx of file.transactions) {
    if (tx.successful) report.successful += 1;
    else report.refused += 1;
    const check = verifyEnvelope(tx.envelopeXdr, file.passphrase, tx.hash);
    if (!check.ok) report.problems.push({ hash: tx.hash, problems: check.problems });
  }
  return report;
}
