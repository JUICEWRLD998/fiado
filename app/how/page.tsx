import type { Metadata } from 'next';
import Link from 'next/link';
import { CLAIMS, explorerAccount, explorerTx } from '@/proof/claims';
import { Book } from '@/ui/Book';
import { buttonStyle } from '@/ui/Button';
import { Gauge } from '@/ui/Gauge';
import { Shell } from '@/ui/Shell';
import s from './how.module.css';

export const metadata: Metadata = {
  title: 'Fiado · How it works',
  description: 'The credit limit is a Stellar trustline limit. Every claim here points at a real transaction on the Stellar test network that you can open and check.',
};

const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export default function HowPage() {
  return (
    <Shell>
      <Book title="How it works, and how to check it" meta={<p className={s.lede}>Every claim on this page points at a real transaction on the Stellar test network. Open it and see.</p>}>
        <figure className={s.figure} aria-labelledby="mechanism">
          <ol className={s.stages} id="mechanism">
            <li className={s.stage}>
              <h3>The customer signs</h3>
              <p>Bisi taps ₦9,000 of cooking oil. Only her phone can sign a purchase, so only she can write a debt.</p>
            </li>
            <li className={s.stage}>
              <h3>The shop’s trustline holds the tab</h3>
              <Gauge
                owed={3200}
                limit={10000}
                attempt={9000}
                label="A bar for a ₦10,000 credit limit. ₦3,200 is owed. A purchase of ₦9,000 would reach past the limit line, so the part beyond the limit is dashed."
              />
              <p className={s.figures}>Limit ₦10,000 · owed ₦3,200 · room left ₦6,800</p>
            </li>
            <li className={s.stage} data-verdict="">
              <h3>The network checks the limit</h3>
              <p>₦9,000 is ₦2,200 more than the room that is left. The network refuses it, and nothing is added to the tab.</p>
            </li>
          </ol>
          <figcaption className={s.caption}>
            <span>The credit limit and the trustline limit are one number.</span> The shop sets it. The network keeps it.
          </figcaption>
        </figure>

        <section className={s.section} aria-labelledby="claims-title">
          <h2 id="claims-title">Six claims, and where to check each</h2>
          <ol className={s.claims} data-testid="claims">
            {CLAIMS.map((c) => (
              <li key={c.id} id={c.id} data-testid="claim">
                <h3>{c.claim}</h3>
                <div>
                  <p>{c.plain}</p>
                  <p className={s.look}>What to look for: {c.look}</p>
                  <div className={s.proof}>
                    {c.tx && (
                      <>
                        <a href={explorerTx(c.tx.hash)} target="_blank" rel="noreferrer" data-testid="claim-ledger-link">
                          See it on the ledger
                        </a>
                        <code className={s.hash}>{shortHash(c.tx.hash)}</code>
                      </>
                    )}
                    {c.record && (
                      <>
                        <Link href={`/record/${c.record}`} data-testid="claim-record-link">
                          Open the record page
                        </Link>
                        <a href={explorerAccount(c.record)} target="_blank" rel="noreferrer">
                          The same account on the ledger
                        </a>
                      </>
                    )}
                    {c.reproduce && (
                      <>
                        <code className={s.cmd}>{c.reproduce.command}</code>
                        <span>{c.reproduce.why}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.section} aria-labelledby="status-title">
          <h2 id="status-title">What is live, and what is not</h2>
          <dl className={s.status} data-testid="status">
            <div>
              <dt>LIVE</dt>
              <dd>Joining by link, buying on credit, the refusal at the limit, cash repayments, write-offs, changing a limit, the shareable record, and the practice shop. All on the Stellar test network.</dd>
            </div>
            <div>
              <dt>NEXT</dt>
              <dd>Repaying in dollars. The transaction is built and tested, and there is no screen for it yet.</dd>
            </div>
            <div>
              <dt>NOT LIVE</dt>
              <dd>Real money. Fiado runs on the test network only, so nothing here moves real funds.</dd>
            </div>
          </dl>
        </section>

        <section className={s.check} aria-labelledby="check-title">
          <h2 id="check-title">Check all of it yourself</h2>
          <p>
            Run <code className={s.cmd}>npm run check:proof</code> in the <a href="https://github.com/JUICEWRLD998/fiado">source</a>. It asks the test network whether each transaction above still
            matches what this page says, and it fails if one does not.
          </p>
          <p>
            <Link {...buttonStyle('primary')} href="/try">
              Try the practice shop
            </Link>{' '}
            <Link {...buttonStyle('secondary')} href="/evidence">
              See real shops
            </Link>
          </p>
        </section>
      </Book>
    </Shell>
  );
}
