import type { Metadata } from 'next';
import { Suspense } from 'react';
import PayFlow from './PayFlow';

export const metadata: Metadata = { title: 'Fiado · Confirm a purchase' };

export default function PayPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <PayFlow />
    </Suspense>
  );
}
