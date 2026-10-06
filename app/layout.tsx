import type { Metadata, Viewport } from 'next';
import '@/ui/tokens.css';
import { MotionProvider } from '@/ui/MotionProvider';
import { atkinson, bricolage } from './fonts';

export const metadata: Metadata = {
  title: 'Fiado',
  description: 'The credit book the network keeps. A shop credit line on Stellar, where only the customer can write a debt.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${atkinson.variable}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
