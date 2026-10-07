import type { Metadata } from 'next';
import Sandbox from './Sandbox';

export const metadata: Metadata = {
  title: 'Fiado · Practice shop',
  description: 'A practice shop on the Stellar test network. Watch the network refuse a purchase over the credit limit. No sign-up, no real money.',
};

export default function TryPage() {
  return <Sandbox />;
}
