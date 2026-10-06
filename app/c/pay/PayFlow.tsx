'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toStroops } from '@/chain/amount';
import { messageOf, reviewPurchase, signPurchase, type PurchaseReview } from '@/client/flows';
import { formatAmount, formatDate, shortKey } from '@/client/format';
import { readSession } from '@/client/handoff';
import { loadTabs } from '@/client/reads';
import { useCustody } from '@/client/useCustody';
import type { BuyOffer } from '@/handoff/session';
import s from '@/ui/ui.module.css';

type Sending = { step: 'idle' } | { step: 'sending' } | { step: 'confirmed'; owed: bigint } | { step: 'pending' } | { step: 'error'; message: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function PayFlow() {
  const id = useSearchParams().get('s');
  const custody = useCustody('customer');
  const [offer, setOffer] = useState<BuyOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [review, setReview] = useState<PurchaseReview | null>(null);
  const [sending, setSending] = useState<Sending>({ step: 'idle' });

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!id) {
        setLoadError('This link has no code. Open the link the shop gave you.');
        return;
      }
      try {
        const session = await readSession(id);
        if (!alive) return;
        if (!session) setLoadError('This code has expired or is wrong. Ask the shop for a new one.');
        else if (session.offer.kind !== 'buy') setLoadError('This is a join code, not a purchase code.');
        else setOffer(session.offer);
      } catch (e) {
        if (alive) setLoadError(messageOf(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!offer || !custody.kp) return;
    let alive = true;
    void reviewPurchase(custody.kp, offer).then((r) => {
      if (alive) setReview(r);
    });
    return () => {
      alive = false;
    };
  }, [offer, custody.kp]);

  async function sign() {
    if (!offer || !id || !custody.kp || !review?.ok) return;
    const before = review.tab.owed;
    setSending({ step: 'sending' });
    try {
      await signPurchase(custody.kp, offer, id);
      // The shop submits it. We watch our own tab to see whether it landed.
      for (let i = 0; i < 20; i++) {
        await sleep(2000);
        const tab = (await loadTabs(custody.kp.publicKey())).find((t) => t.shop === offer.shop);
        if (tab && tab.owed > before) {
          setSending({ step: 'confirmed', owed: tab.owed });
          return;
        }
      }
      setSending({ step: 'pending' });
    } catch (e) {
      setSending({ step: 'error', message: messageOf(e) });
    }
  }

  const amount = offer ? toStroops(offer.amount) : 0n;
  const over = review?.ok ? amount > review.tab.headroom : false;

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Confirm a purchase</h1>
        <span className={s.tag}>Testnet only</span>
      </header>

      {loadError && <p role="alert" data-testid="pay-error" className={s.problem}>{loadError}</p>}
      {!loadError && !offer && <p>Loading…</p>}

      {offer && custody.status === 'none' && (
        <p role="alert" data-testid="pay-nokey" className={s.problem}>
          There is no Fiado account on this device. <Link href="/c">Set one up</Link>, then join this shop with its join code.
        </p>
      )}

      {offer && custody.status === 'locked' && (
        <div className={s.card}>
          <p>Unlock your key to continue.</p>
          <button type="button" className={s.button} data-testid="unlock-customer" disabled={custody.busy} onClick={() => void custody.unlock()}>
            Unlock with passkey
          </button>
          {custody.error && <p role="alert" className={s.problem}>{custody.error}</p>}
        </div>
      )}

      {offer && review && !review.ok && <p role="alert" data-testid="pay-blocked" className={s.problem}>{review.reason}</p>}

      {offer && review?.ok && sending.step === 'idle' && (
        <section className={s.card} data-testid="pay-card">
          <h2>{review.shopName ?? shortKey(offer.shop)}</h2>
          <p>
            <strong data-testid="pay-item">{offer.item}</strong>
            <br />
            <span data-testid="pay-amount">{formatAmount(amount, offer.currency)}</span>
            {offer.due ? ` · due ${formatDate(offer.due)}` : ''}
          </p>
          <p className={s.muted}>
            Signing adds {formatAmount(amount, offer.currency)} to your tab here. Your tab is now {formatAmount(review.tab.owed, review.tab.currency)} of{' '}
            {formatAmount(review.tab.limit, review.tab.currency)}.
          </p>
          {over && (
            <p data-testid="pay-over-limit" className={s.problem}>
              This is over your limit by {formatAmount(amount - review.tab.headroom, offer.currency)}. The network will refuse it and nothing will be added.
            </p>
          )}
          <button type="button" className={s.button} data-testid="sign-purchase" onClick={() => void sign()}>
            Sign
          </button>
        </section>
      )}

      {sending.step === 'sending' && <p role="status" data-testid="pay-sending" className={s.notice}>Signing…</p>}
      {sending.step === 'confirmed' && offer && (
        <section role="status" data-testid="pay-confirmed" className={s.notice}>
          <p>Recorded. Your tab here is now {formatAmount(sending.owed, offer.currency)}.</p>
          <Link href="/c">See my tabs</Link>
        </section>
      )}
      {sending.step === 'pending' && (
        <p role="status" data-testid="pay-pending" className={s.notice}>
          Sent to the shop. If your tab does not change, the shop’s screen will say why, for example that it was over your limit.
        </p>
      )}
      {sending.step === 'error' && <p role="alert" data-testid="pay-failed" className={s.problem}>{sending.message}</p>}
    </main>
  );
}
