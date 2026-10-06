'use client';

import type { Keypair } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { todayUtc, type BookRow } from '@/book';
import { toStroops } from '@/chain/amount';
import { readProfile } from '@/chain/horizon';
import { encodeNote } from '@/chain/memo';
import { cleanCurrency, cleanName } from '@/chain/profile';
import { changeLimit, closeLine, messageOf, repay, runJoin, runSale, setupShopAccount, type ShopFlowState } from '@/client/flows';
import { daysFromNow, formatAmount, formatDate, parseMoney, shortKey } from '@/client/format';
import { loadBook, type ShopBook } from '@/client/reads';
import { reminderText, whatsappLink } from '@/client/remind';
import { useCustody, type Custody } from '@/client/useCustody';
import { useFlow } from '@/client/useFlow';
import type { Mode } from '@/passkey/custody';
import { FlowView } from '@/ui/FlowView';
import { KeyChoice } from '@/ui/KeyChoice';
import s from '@/ui/ui.module.css';

const flowFailed = (message: string): ShopFlowState => ({ step: 'failed', message });
const CURRENCIES = ['₦', 'S/', 'R$', '$'];

export default function ShopApp() {
  const custody = useCustody('shop');
  if (custody.status === 'loading') return <main className={s.page}><p>Loading…</p></main>;
  if (custody.status === 'none') return <Setup custody={custody} />;
  if (custody.status === 'locked' || !custody.kp) return <Locked custody={custody} />;
  return <Ready custody={custody} kp={custody.kp} />;
}

// ---------------------------------------------------------------------------------------------- first run

function Setup({ custody }: { custody: Custody }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(CURRENCIES[0]!);
  const [mode, setMode] = useState<Mode>('passkey');
  const [problem, setProblem] = useState<string | null>(null);
  const effective: Mode = custody.canPasskey ? mode : 'device';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    let clean: string;
    let cur: string;
    try {
      clean = cleanName(name);
      cur = cleanCurrency(currency);
    } catch (err) {
      setProblem(messageOf(err));
      return;
    }
    await custody.create(effective, { name: clean, currency: cur });
  }

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Open your shop</h1>
        <span className={s.tag}>Testnet only</span>
      </header>
      <form className={s.card} onSubmit={submit}>
        <div className={s.field}>
          <label htmlFor="shop-name">Shop name</label>
          <input id="shop-name" data-testid="shop-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" required />
        </div>
        <div className={s.field}>
          <label htmlFor="shop-currency">Currency your customers pay in</label>
          <select id="shop-currency" data-testid="shop-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />
        <button type="submit" className={s.button} data-testid="create-shop" disabled={custody.busy}>
          {custody.busy ? 'Creating…' : 'Create my shop'}
        </button>
        {(problem ?? custody.error) && (
          <p role="alert" data-testid="setup-error" className={s.problem}>
            {problem ?? custody.error}
          </p>
        )}
      </form>
      <p className={s.muted}>This runs on the Stellar test network. No real money is involved.</p>
    </main>
  );
}

function Locked({ custody }: { custody: Custody }) {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Welcome back</h1>
      <div className={s.card}>
        <p>Unlock your shop with your passkey.</p>
        <button type="button" className={s.button} data-testid="unlock-shop" disabled={custody.busy} onClick={() => void custody.unlock()}>
          {custody.busy ? 'Unlocking…' : 'Unlock'}
        </button>
        {custody.error && <p role="alert" className={s.problem}>{custody.error}</p>}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------- the book

function Ready({ custody, kp }: { custody: Custody; kp: Keypair }) {
  const pub = kp.publicKey();
  const meta = custody.meta;
  const [phase, setPhase] = useState<'checking' | 'setup' | 'ok' | 'error'>('checking');
  const [progress, setProgress] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [data, setData] = useState<ShopBook | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadBook(pub));
      setReadError(null);
      setLastRead(new Date().toISOString().slice(11, 19));
    } catch (e) {
      setReadError(messageOf(e)); // keep showing what we last read, and say so
    }
  }, [pub]);

  const savedName = meta?.name ?? 'My shop';
  const savedCurrency = meta?.currency ?? CURRENCIES[0]!;

  const finishSetup = useCallback(async () => {
    setPhase('setup');
    setProblem(null);
    try {
      await setupShopAccount(kp, { name: savedName, currency: savedCurrency }, setProgress);
      setPhase('ok');
      await refresh();
    } catch (e) {
      setProblem(messageOf(e));
      setPhase('error');
    }
  }, [kp, savedName, savedCurrency, refresh]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await readProfile(pub).catch(() => null);
      if (!alive) return;
      if (p?.name) {
        setPhase('ok');
        await refresh();
      } else {
        await finishSetup();
      }
    })();
    return () => {
      alive = false;
    };
  }, [pub, refresh, finishSetup]);

  useEffect(() => {
    if (phase !== 'ok') return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  const currency = data?.currency ?? meta?.currency ?? CURRENCIES[0]!;
  const shopName = data?.shopName ?? meta?.name ?? 'My shop';

  if (phase === 'checking' || phase === 'setup') {
    return (
      <main className={s.page}>
        <h1 className={s.title}>Setting up your shop</h1>
        <p role="status" data-testid="setup-progress" className={s.muted}>{progress || 'Checking your shop…'}</p>
      </main>
    );
  }
  if (phase === 'error') {
    return (
      <main className={s.page}>
        <h1 className={s.title}>Setting up your shop</h1>
        <p role="alert" className={s.problem}>{problem}</p>
        <button type="button" className={s.button} onClick={() => void finishSetup()}>Try again</button>
      </main>
    );
  }

  return (
    <main className={s.page} data-testid="shop-ready">
      <header className={s.header}>
        <h1 className={s.title} data-testid="shop-title">{shopName}</h1>
        <span className={s.tag}>Testnet · {shortKey(pub)}</span>
      </header>

      <AddCustomer kp={kp} currency={currency} shopName={shopName} onDone={refresh} />

      <h2>Your book</h2>
      {readError && (
        <p role="alert" data-testid="read-error" className={s.problem}>
          Could not read the latest ({readError}). {data ? 'Showing what was last read.' : ''}
        </p>
      )}
      {data && data.book.rows.length === 0 && <p className={s.muted} data-testid="book-empty">No customers yet. Add your first customer above.</p>}
      <ul className={s.list} data-testid="book">
        {data?.book.rows.map((row) => (
          <Customer key={row.customer} kp={kp} row={row} currency={currency} shopName={shopName} onDone={refresh} />
        ))}
      </ul>
      <div className={s.actions}>
        <button type="button" className={s.ghost} data-testid="refresh" onClick={() => void refresh()}>Refresh</button>
        {lastRead && <span className={s.muted} data-testid="last-read">Updated {lastRead} UTC</span>}
      </div>
    </main>
  );
}

function AddCustomer({ kp, currency, shopName, onDone }: { kp: Keypair; currency: string; shopName: string; onDone: () => Promise<void> }) {
  const [limit, setLimit] = useState('10000');
  const [problem, setProblem] = useState<string | null>(null);
  const { state, start, cancel } = useFlow<ShopFlowState>(flowFailed);
  const step = state?.step;

  useEffect(() => {
    if (step === 'done') void onDone();
  }, [step, onDone]);

  function go(e: FormEvent) {
    e.preventDefault();
    const amount = parseMoney(limit);
    if (!amount) {
      setProblem('Enter a credit limit like 10000.');
      return;
    }
    setProblem(null);
    start((emit, signal) => runJoin(kp, { shopName, currency, limit: amount, origin: window.location.origin }, emit, signal));
  }

  return (
    <section className={s.card} aria-labelledby="add-title">
      <h2 id="add-title">Add a customer</h2>
      {!state && (
        <form onSubmit={go}>
          <div className={s.field}>
            <label htmlFor="join-limit">Credit limit for this customer ({currency})</label>
            <input id="join-limit" data-testid="join-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <button type="submit" className={s.button} data-testid="start-join">Show join code</button>
          {problem && <p role="alert" className={s.problem}>{problem}</p>}
        </form>
      )}
      <FlowView state={state} onClose={cancel} />
    </section>
  );
}

type Panel = 'sale' | 'repay' | 'limit' | 'writeoff' | 'close' | null;

function Customer({ kp, row, currency, shopName, onDone }: { kp: Keypair; row: BookRow; currency: string; shopName: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState<Panel>(null);
  const oldest = row.oldestUnpaid;
  const toggle = (p: Exclude<Panel, null>) => setOpen(open === p ? null : p);
  const reminder = reminderText({ shopName, row, currency, today: todayUtc() });

  return (
    <li data-testid="book-row">
      <div className={s.row}>
        <div className={s.rowTop}>
          <span className={s.name} data-testid="row-name">{row.name ?? shortKey(row.customer)}</span>
          <span className={s.owed} data-testid="row-owed">{formatAmount(row.owed, currency)}</span>
        </div>
        <div className={s.muted}>
          Limit <span data-testid="row-limit">{formatAmount(row.limit, currency)}</span> ·{' '}
          <span data-testid="row-headroom">{formatAmount(row.headroom, currency)}</span> left
        </div>
        {oldest && (
          <div className={s.muted}>
            Oldest unpaid: {oldest.item}
            {oldest.due ? ` · due ${formatDate(oldest.due)}` : ''} {row.overdue && <span className={s.badge}>overdue</span>}
          </div>
        )}
        {!row.explained && <div className={s.muted}>Some of this customer’s history is missing. The balance shown is what the network holds.</div>}
      </div>
      <div className={s.actions}>
        <button type="button" className={s.ghost} data-testid="open-sale" onClick={() => toggle('sale')}>New purchase</button>
        <button type="button" className={s.ghost} data-testid="open-repay" onClick={() => toggle('repay')}>Cash repayment</button>
        {reminder && (
          <a className={s.ghost} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} data-testid="remind" href={whatsappLink(reminder)} target="_blank" rel="noreferrer">
            Remind on WhatsApp
          </a>
        )}
        <details>
          <summary className={s.ghost} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }} data-testid="open-more">More</summary>
          <div className={s.actions}>
            <button type="button" className={s.ghost} data-testid="open-limit" onClick={() => toggle('limit')}>Change limit</button>
            <button type="button" className={s.ghost} data-testid="open-writeoff" onClick={() => toggle('writeoff')}>Write off</button>
            <button type="button" className={s.ghost} data-testid="open-close" onClick={() => toggle('close')}>Close line</button>
          </div>
        </details>
      </div>
      {open === 'sale' && <SalePanel kp={kp} row={row} currency={currency} onDone={onDone} />}
      {open === 'repay' && <RepayPanel kp={kp} row={row} currency={currency} onDone={onDone} />}
      {open === 'limit' && (
        <ActionPanel
          testid="limit"
          id={`limit-${row.customer}`}
          label={`New limit (${currency})`}
          initial=""
          button="Change limit"
          hint={`They owe ${formatAmount(row.owed, currency)} now, so the limit cannot go lower than that.`}
          run={async (v) => {
            const limit = parseMoney(v);
            if (!limit) throw new Error('Enter a limit like 10000.');
            await changeLimit(kp, { customer: row.customer, limit, owed: row.owed });
            await onDone();
            return `The limit is now ${formatAmount(toStroops(limit), currency)}.`;
          }}
        />
      )}
      {open === 'writeoff' && (
        <ActionPanel
          testid="writeoff"
          id={`writeoff-${row.customer}`}
          label={`Amount to write off (${currency})`}
          button="Write off"
          hint="You are choosing not to collect this. It stays on their record as written off, never as paid."
          run={async (v) => {
            const amount = parseMoney(v);
            if (!amount) throw new Error('Enter an amount like 200.');
            if (toStroops(amount) > row.owed) throw new Error(`They only owe ${formatAmount(row.owed, currency)}.`);
            await repay(kp, { customer: row.customer, amount, kind: 'forgiven' });
            await onDone();
            return `Wrote off ${formatAmount(toStroops(amount), currency)}.`;
          }}
        />
      )}
      {open === 'close' && (
        <ActionPanel
          testid="close"
          id={`close-${row.customer}`}
          button="Close this line"
          hint="Only a settled line can be closed. The customer keeps their history."
          run={async () => {
            if (row.owed !== 0n) throw new Error('Settle what is owed first: record the cash received, or write it off.');
            await closeLine(kp, { customer: row.customer, owed: row.owed });
            await onDone();
            return 'The line is closed.';
          }}
        />
      )}
    </li>
  );
}

/** One small form: an optional field, a button, and the outcome in words. */
function ActionPanel({
  testid,
  id,
  label,
  initial = '',
  button,
  hint,
  run,
}: {
  testid: string;
  id: string;
  label?: string;
  initial?: string;
  button: string;
  hint?: string;
  run: (value: string) => Promise<string>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      setResult({ ok: true, text: await run(value) });
    } catch (err) {
      setResult({ ok: false, text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.card} style={{ marginTop: 12 }} onSubmit={submit}>
      {hint && <p className={s.muted}>{hint}</p>}
      {label && (
        <div className={s.field}>
          <label htmlFor={id}>{label}</label>
          <input id={id} data-testid={`${testid}-input`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      )}
      <button type="submit" className={s.button} data-testid={`${testid}-submit`} disabled={busy}>
        {busy ? 'Working…' : button}
      </button>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} data-testid={`${testid}-result`} className={result.ok ? s.notice : s.problem}>
          {result.text}
        </p>
      )}
    </form>
  );
}

function SalePanel({ kp, row, currency, onDone }: { kp: Keypair; row: BookRow; currency: string; onDone: () => Promise<void> }) {
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(daysFromNow(7));
  const [problem, setProblem] = useState<string | null>(null);
  const { state, start, cancel } = useFlow<ShopFlowState>(flowFailed);
  const step = state?.step;

  useEffect(() => {
    if (step === 'done' || step === 'refused') void onDone();
  }, [step, onDone]);

  const parsed = parseMoney(amount);
  const over = parsed !== null && toStroops(parsed) > row.headroom;

  function show(e: FormEvent) {
    e.preventDefault();
    if (!parsed) {
      setProblem('Enter an amount like 3200 or 3200.50.');
      return;
    }
    if (due && due < todayUtc()) {
      setProblem('The due date cannot be in the past.');
      return;
    }
    try {
      encodeNote({ item, due: due || undefined });
    } catch (err) {
      setProblem(messageOf(err));
      return;
    }
    setProblem(null);
    start((emit, signal) =>
      runSale(kp, { customer: row.customer, amount: parsed, item: item.trim(), due: due || undefined, currency, origin: window.location.origin }, emit, signal),
    );
  }

  return (
    <div className={s.card} style={{ marginTop: 12 }}>
      {!state && (
        <form onSubmit={show}>
          <div className={s.field}>
            <label htmlFor={`item-${row.customer}`}>What is being bought</label>
            <input id={`item-${row.customer}`} data-testid="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Rice 2 bags" required />
          </div>
          <div className={s.field}>
            <label htmlFor={`amount-${row.customer}`}>Amount ({currency})</label>
            <input id={`amount-${row.customer}`} data-testid="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className={s.field}>
            <label htmlFor={`due-${row.customer}`}>Due date</label>
            <input id={`due-${row.customer}`} data-testid="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          {over && (
            <p data-testid="over-limit-hint" className={s.muted}>
              This is over the limit ({formatAmount(row.headroom, currency)} left). The network will refuse it.
            </p>
          )}
          <button type="submit" className={s.button} data-testid="show-sale-code">Show purchase code</button>
          {problem && <p role="alert" className={s.problem}>{problem}</p>}
        </form>
      )}
      <FlowView state={state} onClose={cancel} />
    </div>
  );
}

function RepayPanel({ kp, row, currency, onDone }: { kp: Keypair; row: BookRow; currency: string; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseMoney(amount);
    if (!parsed) {
      setResult({ ok: false, text: 'Enter an amount like 1000.' });
      return;
    }
    if (toStroops(parsed) > row.owed) {
      setResult({ ok: false, text: `They only owe ${formatAmount(row.owed, currency)}.` });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      await repay(kp, { customer: row.customer, amount: parsed });
      setResult({ ok: true, text: `Recorded ${formatAmount(toStroops(parsed), currency)} paid.` });
      setAmount('');
      await onDone();
    } catch (err) {
      setResult({ ok: false, text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={s.card} style={{ marginTop: 12 }} onSubmit={submit}>
      <div className={s.field}>
        <label htmlFor={`repay-${row.customer}`}>Cash received ({currency})</label>
        <input id={`repay-${row.customer}`} data-testid="repay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button type="submit" className={s.button} data-testid="repay-submit" disabled={busy}>{busy ? 'Recording…' : 'Record repayment'}</button>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} data-testid="repay-result" className={result.ok ? s.notice : s.problem}>{result.text}</p>
      )}
    </form>
  );
}
