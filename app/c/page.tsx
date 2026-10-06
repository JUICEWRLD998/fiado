import type { Metadata } from 'next';
import CustomerHome from './CustomerHome';

export const metadata: Metadata = { title: 'Fiado · My tabs' };

export default function CustomerPage() {
  return <CustomerHome />;
}
