'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ShopEvidence } from '@/book';
import { messageOf } from '@/client/flows';
import { formatDate, shortKey } from '@/client/format';
import { loadEvidence } from '@/client/reads';
import type { RegisteredShop } from '@/evidence/registry';
import { Book, BookRow, BookRows } from '@/ui/Book';
import { buttonStyle } from '@/ui/Button';
import { Notice } from '@/ui/Notice';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import s from './evidence.module.css';

type Result = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; evidence: ShopEvidence };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Real shops only: each one agreed to be named, and every number is counted live from its public history on the
 * Stellar test network (nothing is stored or typed in). Practice shops from /try are never listed.
 */
export default function EvidenceView({ shops }: { shops: readonly RegisteredShop[] }) {
  const [results, setResults] = useState<Record<string, Result>>({});

  useEffect(() => {
    let alive = true;
    for (const shop of shops) {
      loadEvidence(shop.pub).then(
        (evidence) => alive && setResults((r) => ({ ...r, [shop.pub]: { status: 'ok', evidence } })),
        (e) => alive && setResults((r) => ({ ...r, [shop.pub]: { status: 'error', message: messageOf(e) } })),
      );
    }
    return () => {
      alive = false;
    };
  }, [shops]);

  const loaded = shops.flatMap((shop) => {
    const r = results[shop.pub];
    return r?.status === 'ok' ? [r.evidence] : [];
  });
  const sum = (pick: (e: ShopEvidence) => number) => loaded.reduce((n, e) => n + pick(e), 0);

  return (
    <Shell>
      <Book
        title="Evidence"
        titleTestId="evidence-title"
        meta={<p style={{ margin: 0 }}>Real shops that keep their credit book on Fiado. Counted live from the Stellar test network.</p>}
      >
        {shops.length === 0 ? (
          <div className={s.empty} data-testid="evidence-empty">
            <Notice tone="note">No shopkeeper has agreed to be listed yet, so there is nothing to count. This page never shows made-up numbers.</Notice>
            <p>
              A shop is listed here only after its owner agrees, in writing, to be named by first name and city. Until then, the practice shop shows the same mechanism with the same kind of
              transactions.
            </p>
            <div className={u.actions}>
              <Link {...buttonStyle('primary')} href="/try">
                Try the practice shop
              </Link>
              <Link {...buttonStyle('secondary')} href="/how">
                How to check a claim
              </Link>
            </div>
          </div>
        ) : (
          <>
            {loaded.length === shops.length && (
              <p className={s.totals} data-testid="evidence-totals">
                {plural(shops.length, 'shop', 'shops')} · {plural(sum((e) => e.purchases), 'purchase', 'purchases')} · {sum((e) => e.refusals)} refused at the limit ·{' '}
                {plural(sum((e) => e.repayments), 'repayment', 'repayments')}
              </p>
            )}
            <BookRows testId="evidence-shops">
              {shops.map((shop) => (
                <ShopEntry key={shop.pub} shop={shop} result={results[shop.pub] ?? { status: 'loading' }} />
              ))}
            </BookRows>
          </>
        )}

        <section className={s.rules} aria-labelledby="rules-title">
          <h2 id="rules-title">What is counted here</h2>
          <ul>
            <li>Only real shops that agreed to be named. Practice shops from the try page are never counted.</li>
            <li>Counts only, never amounts, because shops use different currencies.</li>
            <li>A refusal is a purchase the network refused for going over the credit limit.</li>
            <li>Every row links to the shop’s public history, so you can count it yourself.</li>
          </ul>
        </section>
      </Book>
    </Shell>
  );
}

function ShopEntry({ shop, result }: { shop: RegisteredShop; result: Result }) {
  return (
    <BookRow testId="evidence-shop">
      <div className={s.shop}>
        <div className={u.top}>
          <span className={u.name} data-testid="evidence-shop-name">
            {shop.firstName}’s shop
          </span>
          <span className={u.meta}>{shop.city}</span>
        </div>
        {result.status === 'loading' && <p className={u.meta}>Reading the ledger…</p>}
        {result.status === 'error' && <Notice tone="problem">The ledger could not be read just now: {result.message}</Notice>}
        {result.status === 'ok' && (
          <dl className={s.counts}>
            <div>
              <dt>Customers</dt>
              <dd data-testid="count-customers">{result.evidence.customers}</dd>
            </div>
            <div>
              <dt>Purchases</dt>
              <dd data-testid="count-purchases">{result.evidence.purchases}</dd>
            </div>
            <div>
              <dt>Refused at the limit</dt>
              <dd className={result.evidence.refusals > 0 ? s.refused : undefined} data-testid="count-refusals">
                {result.evidence.refusals}
              </dd>
            </div>
            <div>
              <dt>Repayments</dt>
              <dd data-testid="count-repayments">{result.evidence.repayments}</dd>
            </div>
          </dl>
        )}
        <p className={u.meta}>
          Listed since {formatDate(shop.consentedOn)} ·{' '}
          <a href={`https://stellar.expert/explorer/testnet/account/${shop.pub}`} target="_blank" rel="noreferrer">
            Check it on the ledger
          </a>{' '}
          · {shortKey(shop.pub)}
        </p>
      </div>
    </BookRow>
  );
}
