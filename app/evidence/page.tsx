import type { Metadata } from 'next';
import { REAL_SHOPS, validateRegistry } from '@/evidence/registry';
import EvidenceView from './EvidenceView';

export const metadata: Metadata = {
  title: 'Fiado · Evidence',
  description: 'Real shops that keep their credit book on Fiado, with counts read live from the Stellar test network. Only shops that agreed to be named are listed.',
};

export default function EvidencePage() {
  // A registry entry without consent, or with demo data, must stop the build rather than reach the page.
  const problems = validateRegistry(REAL_SHOPS);
  if (problems.length) throw new Error(`Invalid evidence registry:\n${problems.join('\n')}`);
  return <EvidenceView shops={REAL_SHOPS} />;
}
