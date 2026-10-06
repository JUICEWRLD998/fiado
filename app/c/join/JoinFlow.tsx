'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { cleanName } from '@/chain/profile';
import { awaitJoinRequest, messageOf, signJoin, type CustomerJoinState } from '@/client/flows';
import { formatAmount } from '@/client/format';
import { readSession } from '@/client/handoff';
import { useCustody } from '@/client/useCustody';
import { useFlow } from '@/client/useFlow';
import type { JoinOffer } from '@/handoff/session';
import type { Mode } from '@/passkey/custody';
import { KeyChoice } from '@/ui/KeyChoice';
import s from '@/ui/ui.module.css';

const failed = (message: string): CustomerJoinState => ({ step: 'failed', message });

export default function JoinFlow() {
  const id = useSearchParams().get('s');
  const custody = useCustody('customer');
  const [offer, setOffer] = useState<JoinOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('passkey');
  const [problem, setProblem] = useState<string | null>(null);
  const { state, start } = useFlow<CustomerJoinState>(failed);
  const savedName = custody.meta?.name ?? '';

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
        else if (session.offer.kind !== 'join') setLoadError('This is a purchase code, not a join code.');
        else setOffer(session.offer);
      } catch (e) {
        if (alive) setLoadError(messageOf(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const shownName = name || savedName;
  const effective: Mode = custody.canPasskey ? mode : 'device';

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!offer || !id) return;
    setProblem(null);
    let clean: string;
    try {
      clean = cleanName(shownName);
    } catch (err) {
      setProblem(messageOf(err));
      return;
    }
    const kp = custody.kp ?? (custody.status === 'none' ? await custody.create(effective, { name: clean }) : await custody.unlock());
    if (!kp) return;
    if (savedName !== clean) custody.rename(clean);
    start((emit, signal) => awaitJoinRequest(kp, offer, id, clean, emit, signal));
  }

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Join a shop</h1>
        <span className={s.tag}>Testnet only</span>
      </header>

      {loadError && <p role="alert" data-testid="join-error" className={s.problem}>{loadError}</p>}
      {!loadError && !offer && <p>Loading…</p>}

      {offer && !state && (
        <form className={s.card} onSubmit={join} data-testid="offer-card">
          <h2>{offer.shopName} offers you a credit line</h2>
          <p>
            Limit: <strong data-testid="offer-limit">{formatAmount(toStroopsSafe(offer.limit), offer.currency)}</strong>. You can buy on credit up to
            this amount and pay later.
          </p>
          <div className={s.field}>
            <label htmlFor="join-name">Your name</label>
            <input id="join-name" data-testid="customer-name" value={shownName} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
          {custody.status === 'none' && <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />}
          <button type="submit" className={s.button} data-testid="join-button" disabled={custody.busy || custody.status === 'loading'}>
            {custody.busy ? 'One moment…' : custody.status === 'locked' ? 'Unlock and join' : 'Join'}
          </button>
          {(problem ?? custody.error) && <p role="alert" className={s.problem}>{problem ?? custody.error}</p>}
        </form>
      )}

      {state?.step === 'waiting_shop' && (
        <p role="status" data-testid="join-waiting" className={s.notice}>Waiting for {offer?.shopName ?? 'the shop'} to prepare your credit line…</p>
      )}

      {state?.step === 'review' && offer && (
        <section className={s.card} data-testid="review-card">
          <h2>Check before you sign</h2>
          <ul>
            <li>
              {state.shopName} will open a credit line of <strong>{formatAmount(state.limit, state.currency)}</strong> for you.
            </li>
            <li>Only you can add to your tab. Every purchase needs your signature.</li>
            <li>If a purchase would go over the limit, the network refuses it.</li>
            {!state.existing && <li>Your account is created for you. The shop pays the fees; you need no money.</li>}
          </ul>
          <button
            type="button"
            className={s.button}
            data-testid="sign-join"
            onClick={() => custody.kp && start((emit, signal) => signJoin(custody.kp!, offer, id!, state.tx, emit, signal))}
          >
            Sign and join
          </button>
        </section>
      )}

      {state?.step === 'sent' && <p role="status" data-testid="join-sent" className={s.notice}>Signed. Waiting for the network…</p>}

      {state?.step === 'done' && (
        <section className={s.notice} data-testid="join-done" role="status">
          <p>
            You are in. {state.tab?.shopName ?? offer?.shopName}: {state.tab ? formatAmount(state.tab.owed, state.tab.currency) : ''} owed of{' '}
            {state.tab ? formatAmount(state.tab.limit, state.tab.currency) : ''}.
          </p>
          <Link href="/c">See my tabs</Link>
        </section>
      )}

      {state?.step === 'failed' && <p role="alert" data-testid="join-failed" className={s.problem}>{state.message}</p>}
      {state?.step === 'expired' && <p role="alert" data-testid="join-expired" className={s.problem}>This code expired. Ask the shop for a new one.</p>}
    </main>
  );
}

function toStroopsSafe(amount: string): bigint {
  const [w = '0', f = ''] = amount.split('.');
  return BigInt(w) * 10_000_000n + BigInt((f + '0000000').slice(0, 7));
}
