import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import b from '@/ui/book.module.css';
import { buttonStyle } from '@/ui/Button';
import { Shell } from '@/ui/Shell';
import Replay from './Replay';
import s from './page.module.css';

export const metadata: Metadata = {
  title: 'Fiado: your shop’s credit book, kept by the network',
  description:
    'Customers sign every purchase on their own phone, and the Stellar network refuses anything over the credit limit. A shop credit book nobody can argue with. Runs on the Stellar test network.',
};

// A real refusal on the Stellar test network: Bisi owed ₦3,200 of a ₦10,000 limit and tried to buy ₦9,000 on credit.
const REFUSED_TX = 'https://stellar.expert/explorer/testnet/tx/d04d57899f3ea8e5aae1b14026c1d7c3a6a643bb8e3def11f05a83c14059c3db';

export default function Landing() {
  return (
    <Shell
      footer={
        <p style={{ margin: 0 }}>
          Built by Mustapha Fadhlullah for the Find Your Way Hackathon. It runs on the Stellar test network, so nothing here moves real money.{' '}
          <a href="https://github.com/JUICEWRLD998/fiado">Source on GitHub</a>.
        </p>
      }
    >
      <article className={`${b.page} ${s.page}`}>
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <h1 id="hero-title" className={s.title}>
              Your shop’s credit book, kept by the network.
            </h1>
            <p className={s.lede}>
              Your customers sign every purchase on their own phone. The network refuses anything over the limit you set. Nobody argues about what was written.
            </p>
            <div className={s.cta}>
              <Link {...buttonStyle('primary')} href="/shop">
                Open my shop
              </Link>
              <Link {...buttonStyle('secondary')} href="/c">
                I’m a customer
              </Link>
              <Link {...buttonStyle('quiet')} href="/try" data-testid="landing-try">
                Try a practice shop
              </Link>
            </div>
            <p className={s.note}>Runs on the Stellar test network. No real money.</p>
          </div>
          <figure className={s.figure}>
            <Image
              src="/imagery/refusal-crop.webp"
              alt="A shop's credit book. A purchase of ₦9,000 for a customer who owes ₦3,200 of a ₦10,000 limit has been refused: the hatched bar stops at the red limit line and a stamp reads Refused."
              width={1100}
              height={930}
              sizes="(min-width: 900px) 34rem, 100vw"
              preload
              className={s.shot}
            />
            <figcaption className={s.caption}>The real shop screen, after a real refusal on the Stellar test network.</figcaption>
          </figure>
        </section>

        <section className={s.section} aria-labelledby="why-title">
          <h2 id="why-title">A notebook is written by one person</h2>
          <p>
            We asked three shopkeepers in Nigeria how credit goes wrong. Between them they extend credit to 50 to 60 regular customers. Every shop has a dispute every
            month: someone says they already paid, or that the amount is wrong. Every shop has lost customers over it.
          </p>
          <blockquote className={s.quote}>
            <p>
              <span>I’ve lost a few customers because they don’t agree with what I wrote.</span>
            </p>
            <footer>Foodstuff shop owner, Nigeria</footer>
          </blockquote>
        </section>

        <section className={s.section} aria-labelledby="how-title">
          <h2 id="how-title">Fiado moves the pen</h2>
          <ul className={s.entries}>
            <li>
              <h3>The customer writes the debt</h3>
              <p>A purchase is a payment the customer signs on their own phone. The shop cannot add to anyone’s tab, and nobody can say they did not agree.</p>
            </li>
            <li>
              <h3>The network keeps the limit</h3>
              <p>The credit limit is a limit on a Stellar trustline. A purchase over it is refused by the network itself, not by the shop’s software.</p>
            </li>
            <li>
              <h3>A record that travels</h3>
              <p>Every repayment is public. A new shop can read how a customer has paid before it opens a line, and the customer shares that record with one link.</p>
            </li>
          </ul>
        </section>

        <section className={s.section} aria-labelledby="say-no">
          <h2 id="say-no">Watch the network say no</h2>
          <p>Bisi owes ₦3,200 of a ₦10,000 limit and tries to buy ₦9,000 on credit. This happened on the Stellar test network, and the transaction is public.</p>
          <Replay owed={3200} limit={10000} attempt={9000} currency="₦" txUrl={REFUSED_TX} />
        </section>

        <section className={s.end}>
          <Link {...buttonStyle('primary')} href="/shop">
            Open my shop
          </Link>
        </section>
      </article>
    </Shell>
  );
}
