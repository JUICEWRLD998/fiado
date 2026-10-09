'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ShopEvidence } from '@/book';
import { messageOf } from '@/client/flows';
import { formatDate, shortKey } from '@/client/format';
import { loadEvidence } from '@/client/reads';
import { type PaperShop, paperTotals } from '@/evidence/paper';
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
export default function EvidenceView({ shops, paperShops = [] }: { shops: readonly RegisteredShop[]; paperShops?: readonly PaperShop[] }) {
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
            <Notice tone="note">
              No shop has lines on the Stellar test network yet, so there is nothing to count live. This page never shows made-up numbers.
            </Notice>
            <p>
              A shop is listed here only after its owner agrees, in writing, to be named by first name and city. Shops that have agreed are shown below with their notebook figures. Their live counts
              appear here once they keep the book on Fiado. Meanwhile, the practice shop shows the same mechanism with the same kind of transactions.
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

        {paperShops.length > 0 && <PaperBlock shops={paperShops} />}

        <section className={s.rules} aria-labelledby="rules-title">
          <h2 id="rules-title">What is counted here</h2>
          <ul>
            <li>Only real shops that agreed to be named. Practice shops from the try page are never counted.</li>
            <li>Live counts are counts only, never amounts, because shops use different currencies. The notebook block is the exception: all three shops are in Lagos and write in naira.</li>
            <li>A refusal is a purchase the network refused for going over the credit limit.</li>
            <li>Every live row links to the shop’s public history, so you can count it yourself. Notebook rows have no ledger link because they are not on the ledger.</li>
          </ul>
        </section>
      </Book>
    </Shell>
  );
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/** Notebook totals the shopkeepers reported. Not on the ledger, so they are labelled apart from the live counts. */
function PaperBlock({ shops }: { shops: readonly PaperShop[] }) {
  const all = shops.map(paperTotals);
  const sum = (pick: (t: ReturnType<typeof paperTotals>) => number) => all.reduce((n, t) => n + pick(t), 0);
  return (
    <section className={s.rules} aria-labelledby="paper-title" data-testid="evidence-paper">
      <h2 id="paper-title">Reported from shop notebooks</h2>
      <Notice tone="note">
        These figures come from the shopkeepers’ own paper records during the field test. They are not on the Stellar ledger, so they are not part of the live counts above. Customer names
        and phone numbers are never shown.
      </Notice>
      <p className={s.totals} data-testid="paper-totals">
        {plural(shops.length, 'shop', 'shops')} · {plural(sum((t) => t.credits), 'credit purchase', 'credit purchases')} · {plural(sum((t) => t.repayments), 'cash repayment', 'cash repayments')} ·{' '}
        {plural(sum((t) => t.refusals), 'refused request', 'refused requests')} · {naira(sum((t) => t.creditAmount))} issued · {naira(sum((t) => t.repaymentAmount))} repaid ·{' '}
        {naira(sum((t) => t.outstanding))} outstanding
      </p>
      <BookRows testId="paper-shops">
        {shops.map((shop) => {
          const t = paperTotals(shop);
          return (
            <BookRow key={shop.firstName} testId="paper-shop">
              <div className={s.shop}>
                <div className={u.top}>
                  <span className={u.name}>{shop.firstName}’s shop</span>
                  <span className={u.meta}>{shop.city}</span>
                </div>
                <p className={u.meta}>
                  {plural(t.credits, 'credit purchase', 'credit purchases')} ({naira(t.creditAmount)}) · {plural(t.repayments, 'cash repayment', 'cash repayments')} ({naira(t.repaymentAmount)}) ·{' '}
                  {plural(t.refusals, 'refused request', 'refused requests')} · {naira(t.outstanding)} outstanding
                </p>
                <p className={u.meta}>Consent given {formatDate(shop.consentedOn)} · paper record, not on the ledger</p>
              </div>
            </BookRow>
          );
        })}
      </BookRows>
    </section>
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
