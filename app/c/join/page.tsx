import type { Metadata } from 'next';
import { Suspense } from 'react';
import JoinFlow from './JoinFlow';

export const metadata: Metadata = { title: 'Fiado · Join a shop' };

export default function JoinPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <JoinFlow />
    </Suspense>
  );
}
