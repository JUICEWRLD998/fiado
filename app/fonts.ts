import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from 'next/font/google';

// Both are free and self-hosted by Next at build time (no request to Google from a visitor's browser).
// latin-ext is needed for the Naira sign (U+20A6).

/** Names and headings: a grotesque with the slight irregularity of a hand-painted shop sign. */
export const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-bricolage',
  display: 'swap',
  axes: ['opsz', 'wdth'],
});

/** Everything else: designed for low-vision legibility, so it holds up in glare and on cheap screens. */
export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-atkinson',
  display: 'swap',
});
