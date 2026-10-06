import type { Metadata } from 'next';
import ShopApp from './ShopApp';

export const metadata: Metadata = { title: 'Fiado · Shop' };

export default function ShopPage() {
  return <ShopApp />;
}
