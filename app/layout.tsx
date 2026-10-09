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
    <html lang="en" className={`${bricolage.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before first paint, so the page never flashes the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('fiado-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
