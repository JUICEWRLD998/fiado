'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookRow as Row } from '@/book';
import { EXPLORER_TX } from '@/chain/config';
import { messageOf } from '@/client/flows';
import { formatAmount, shortKey } from '@/client/format';
import { loadBook, type ShopBook } from '@/client/reads';
import { createPractice, PRACTICE_CURRENCY, practiceBuy, practiceRepay, type Outcome, type Practice } from '@/client/sandbox';
import { Book, BookRow, BookRows } from '@/ui/Book';
import { Button } from '@/ui/Button';
import { Gauge } from '@/ui/Gauge';
import { LedgerCorner } from '@/ui/Illustrations';
import { Notice } from '@/ui/Notice';
import { RefusalMoment } from '@/ui/RefusalMoment';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import s from './sandbox.module.css';

const UNIT = 10_000_000n;
const units = (n: bigint) => Number(n) / Number(UNIT);
const wholeUnits = (n: bigint) => (n / UNIT).toString();

type Refresh = (until?: (rows: Row[]) => boolean) => Promise<void>;

type View =
  | { status: 'building'; text: string }
  | { status: 'ready'; book: ShopBook; practice: Practice }
  | { status: 'error'; message: string };

type Shown =
  | { kind: 'bought'; hash: string; amount: bigint }
  | { kind: 'repaid'; hash: string; amount: bigint }
  | { kind: 'refused'; hash: string | null; message: string; owed: bigint; limit: bigint; attempt: bigint; n: number };

/**
 * The practice shop. One click from anywhere: this page builds a real shop and two real customers on the Stellar
 * test network, in this tab, with keys that are never stored or sent. Every step is a transaction anyone can look up,
 * and the refusal at the credit limit is the network's own answer, not a message the page made up.
 */
export default function Sandbox() {
  const [view, setView] = useState<View>({ status: 'building', text: 'Starting your practice shop…' });
  const [steps, setSteps] = useState<string[]>([]);
  const practice = useRef<Practice | null>(null);
  const started = useRef(false);

  const refresh = useCallback<Refresh>(async (until) => {
    const p = practice.current;
    if (!p) return;
    // Horizon can trail the ledger by a moment; wait for the change we just made to show up in the book.
    for (let i = 0; i < 8; i++) {
      const book = await loadBook(p.shop.publicKey());
      if (!until || until(book.book.rows) || i === 7) {
        setView({ status: 'ready', book, practice: p });
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, []);

  const start = useCallback(async () => {
    practice.current = null;
    setSteps([]);
    setView({ status: 'building', text: 'Starting your practice shop…' });
    try {
      practice.current = await createPractice((text) => {
        setView({ status: 'building', text });
        setSteps((prev) => (prev[prev.length - 1] === text ? prev : [...prev, text]));
      });
      await refresh();
    } catch (e) {
      setView({ status: 'error', message: messageOf(e) });
    }
  }, [refresh]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  return (
    <Shell>
      <Book
        title={
          <>
            Practice shop<span className={s.tag}>Demo</span>
          </>
        }
        titleTestId="practice-title"
        meta={
          <p style={{ margin: 0 }} data-testid="practice-label">
            Practice only. Made fresh in this tab on the Stellar test network, with no real money. It is never counted as a real shop.
          </p>
        }
        aside={
          <div className={u.asideCard}>
            <h2>What is real here</h2>
            <p className={u.meta} style={{ margin: 0 }}>
              Every step is a genuine transaction on the test network, so you can look each one up. Only the shop and the customers are practice.
            </p>
            <p className={u.meta} style={{ margin: 0 }}>
              Their keys live in this tab only. Close it and they are gone.
            </p>
            <LedgerCorner className={u.art} />
          </div>
        }
      >
        {view.status === 'building' && (
          <div className={s.building} data-testid="practice-building">
            <Notice tone="pending">{view.text}</Notice>
            <p className={u.meta}>This takes about half a minute. Each step is a real transaction, and the network closes a ledger every few seconds.</p>
            {steps.length > 1 && (
              <ol className={s.steps}>
                {steps.slice(0, -1).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {view.status === 'error' && (
          <div className={s.building}>
            <Notice tone="problem" data-testid="practice-error">
              The practice shop could not be built: {view.message}
            </Notice>
            <div className={u.actions}>
              <Button variant="primary" data-testid="practice-retry" onClick={() => void start()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {view.status === 'ready' && <Ready book={view.book} practice={view.practice} refresh={refresh} restart={() => void start()} />}
      </Book>
    </Shell>
  );
}

function Ready({ book, practice, refresh, restart }: { book: ShopBook; practice: Practice; refresh: Refresh; restart: () => void }) {
  const rows = book.book.rows;
  const total = rows.reduce((sum, r) => sum + r.owed, 0n);
  return (
    <section data-testid="practice-ready">
      <p className={u.meta} data-testid="practice-summary">
        {rows.length} customers owe {formatAmount(total, PRACTICE_CURRENCY)} in total. Use the buttons to act as the customer, then watch what the network does.
      </p>
      <BookRows testId="practice-book">
        {rows.map((row) => (
          <PracticeRow key={row.customer} row={row} practice={practice} refresh={refresh} />
        ))}
      </BookRows>
      <div className={u.actions}>
        <Link href="/how">How it works</Link>
        <Link href="/evidence">Real shops</Link>
        <Button variant="quiet" data-testid="practice-restart" onClick={restart}>
          Start a new practice shop
        </Button>
      </div>
      <p className={s.footnote}>
        Shop key {shortKey(practice.shop.publicKey())}.{' '}
        <a href={`https://stellar.expert/explorer/testnet/account/${practice.shop.publicKey()}`} target="_blank" rel="noreferrer">
          Look up this practice shop on the ledger
        </a>
        .
      </p>
    </section>
  );
}

function PracticeRow({ row, practice, refresh }: { row: Row; practice: Practice; refresh: Refresh }) {
  const index = practice.customers.findIndex((c) => c.key.publicKey() === row.customer);
  const [busy, setBusy] = useState<'buy' | 'over' | 'repay' | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const attempts = useRef(0);
  const cur = PRACTICE_CURRENCY;

  const small = 500n * UNIT;
  const over = (row.headroom > 0n ? row.headroom : 0n) + 2000n * UNIT;
  const canSmall = row.headroom >= small;

  async function buy(kind: 'buy' | 'over', amount: bigint, item: string) {
    setBusy(kind);
    setProblem(null);
    try {
      const out: Outcome = await practiceBuy(practice, index, { amount: wholeUnits(amount), item });
      if (out.ok) {
        setShown({ kind: 'bought', hash: out.hash, amount });
        await refresh((rows) => rows.find((r) => r.customer === row.customer)?.owed === row.owed + amount);
      } else {
        attempts.current += 1;
        setShown({ kind: 'refused', hash: out.hash, message: out.message, owed: row.owed, limit: row.limit, attempt: amount, n: attempts.current });
      }
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function repay() {
    setBusy('repay');
    setProblem(null);
    try {
      const hash = await practiceRepay(practice, index, wholeUnits(row.owed));
      setShown({ kind: 'repaid', hash, amount: row.owed });
      await refresh((rows) => rows.find((r) => r.customer === row.customer)?.owed === 0n);
    } catch (e) {
      setProblem(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  const label = `${formatAmount(row.owed, cur)} owed of a ${formatAmount(row.limit, cur)} limit`;
  const link = (hash: string, text: string) => (
    <a className={s.ledger} href={`${EXPLORER_TX}${hash}`} target="_blank" rel="noreferrer" data-testid="practice-ledger-link">
      {text}
    </a>
  );

  return (
    <BookRow testId="practice-row" mark={row.owed === 0n ? 'clear' : undefined}>
      <div className={u.top}>
        <span className={u.name} data-testid="practice-name">
          {row.name ?? shortKey(row.customer)}
          <span className={s.tag}>Demo</span>
        </span>
        <span className={u.owed} data-testid="practice-owed">
          {formatAmount(row.owed, cur)}
        </span>
      </div>
      <Gauge owed={units(row.owed)} limit={units(row.limit)} label={label} />
      <p className={u.meta}>
        Limit {formatAmount(row.limit, cur)} · {formatAmount(row.headroom, cur)} left
      </p>

      <div className={u.actions}>
        <Button data-testid="practice-buy-small" busy={busy === 'buy'} disabled={busy !== null || !canSmall} onClick={() => void buy('buy', small, 'Sugar 1kg')}>
          Buy {formatAmount(small, cur)} on credit
        </Button>
        <Button variant="primary" data-testid="practice-buy-over" busy={busy === 'over'} disabled={busy !== null} onClick={() => void buy('over', over, 'Cooking oil 25L')}>
          Try {formatAmount(over, cur)}, over the limit
        </Button>
        <Button data-testid="practice-repay" busy={busy === 'repay'} disabled={busy !== null || row.owed === 0n} onClick={() => void repay()}>
          Paid {formatAmount(row.owed, cur)} in cash
        </Button>
      </div>

      <div className={s.result} data-testid="practice-result">
        {problem && <Notice tone="problem">{problem}</Notice>}
        {shown?.kind === 'bought' && (
          <Notice tone="ok">
            The customer signed it and the network recorded {formatAmount(shown.amount, cur)}.{link(shown.hash, 'Look it up on the ledger')}
          </Notice>
        )}
        {shown?.kind === 'repaid' && (
          <Notice tone="ok">
            Cash repayment recorded. The tab went down by {formatAmount(shown.amount, cur)}.{link(shown.hash, 'Look it up on the ledger')}
          </Notice>
        )}
        {shown?.kind === 'refused' && (
          <RefusalMoment
            key={shown.n}
            owed={units(shown.owed)}
            limit={units(shown.limit)}
            attempt={units(shown.attempt)}
            label={`${formatAmount(shown.owed, cur)} owed of a ${formatAmount(shown.limit, cur)} limit. A purchase of ${formatAmount(shown.attempt, cur)} was refused.`}
            figures={`Owed ${formatAmount(shown.owed, cur)} · limit ${formatAmount(shown.limit, cur)} · tried ${formatAmount(shown.attempt, cur)}`}
            sentence={shown.message}
          >
            {shown.hash && link(shown.hash, 'Look up the refused transaction')}
          </RefusalMoment>
        )}
      </div>
    </BookRow>
  );
}
