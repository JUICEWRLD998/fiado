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
import { Button, buttonStyle } from '@/ui/Button';
import { Gauge } from '@/ui/Gauge';
import { Notice } from '@/ui/Notice';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import { Slip } from '@/ui/Slip';

type Sending = { step: 'idle' } | { step: 'sending' } | { step: 'confirmed'; owed: bigint } | { step: 'pending' } | { step: 'error'; message: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const units = (n: bigint) => Number(n) / 10_000_000;

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
    <Shell>
      <div className={u.centre}>
        {loadError && (
          <Notice tone="problem" data-testid="pay-error">
            {loadError}
          </Notice>
        )}
        {!loadError && !offer && <p>Loading…</p>}

        {offer && custody.status === 'none' && (
          <Notice tone="problem" data-testid="pay-nokey">
            There is no Fiado account on this device. <Link href="/c">Set one up</Link>, then join this shop with its join code.
          </Notice>
        )}

        {offer && custody.status === 'locked' && (
          <Slip title="Unlock to continue">
            <Button variant="primary" data-testid="unlock-customer" busy={custody.busy} onClick={() => void custody.unlock()}>
              Unlock with passkey
            </Button>
            {custody.error && <Notice tone="problem">{custody.error}</Notice>}
          </Slip>
        )}

        {offer && review && !review.ok && (
          <Notice tone="problem" data-testid="pay-blocked">
            {review.reason}
          </Notice>
        )}

        {offer && review?.ok && sending.step === 'idle' && (
          <Slip title={review.shopName ?? shortKey(offer.shop)} data-testid="pay-card">
            <div className={u.terms}>
              <p className={u.termsItem} data-testid="pay-item">
                {offer.item}
              </p>
              <p className={u.termsAmount} data-testid="pay-amount">
                {formatAmount(amount, offer.currency)}
              </p>
              {offer.due && <p className={u.meta}>due {formatDate(offer.due)}</p>}
            </div>
            <Gauge
              owed={units(review.tab.owed)}
              limit={units(review.tab.limit)}
              attempt={units(amount)}
              label={`Your tab is ${formatAmount(review.tab.owed, review.tab.currency)} of a ${formatAmount(review.tab.limit, review.tab.currency)} limit. This purchase would add ${formatAmount(amount, offer.currency)}.`}
            />
            <p className={u.meta}>
              Signing adds {formatAmount(amount, offer.currency)} to your tab here. Your tab is now {formatAmount(review.tab.owed, review.tab.currency)} of{' '}
              {formatAmount(review.tab.limit, review.tab.currency)}.
            </p>
            {over && (
              <Notice tone="problem" data-testid="pay-over-limit">
                This is over your limit by {formatAmount(amount - review.tab.headroom, offer.currency)}. The network will refuse it and nothing will be added.
              </Notice>
            )}
            <div className={u.actions}>
              <Button variant="primary" data-testid="sign-purchase" onClick={() => void sign()}>
                Sign
              </Button>
            </div>
          </Slip>
        )}

        {sending.step === 'sending' && (
          <Notice tone="pending" data-testid="pay-sending">
            Signing…
          </Notice>
        )}
        {sending.step === 'confirmed' && offer && (
          <Notice tone="ok" data-testid="pay-confirmed">
            <p>Recorded. Your tab here is now {formatAmount(sending.owed, offer.currency)}.</p>
            <Link {...buttonStyle('secondary')} href="/c">
              See my tabs
            </Link>
          </Notice>
        )}
        {sending.step === 'pending' && (
          <Notice tone="pending" data-testid="pay-pending">
            Sent to the shop. If your tab does not change, the shop’s screen will say why, for example that it was over your limit.
          </Notice>
        )}
        {sending.step === 'error' && (
          <Notice tone="problem" data-testid="pay-failed">
            {sending.message}
          </Notice>
        )}
      </div>
    </Shell>
  );
}
