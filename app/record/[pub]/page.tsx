import { StrKey } from '@stellar/stellar-sdk';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import RecordView from './RecordView';

export const metadata: Metadata = { title: 'Fiado · Record' };

export default async function RecordPage({ params }: { params: Promise<{ pub: string }> }) {
  const { pub } = await params;
  // The checksum too, not just the shape: Horizon answers 400 for an address that merely looks right.
  if (!StrKey.isValidEd25519PublicKey(pub)) notFound();
  return <RecordView pub={pub} />;
}
