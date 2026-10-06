'use client';

import type { Keypair } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { todayUtc, type BookRow as Row } from '@/book';
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
import { Book, BookRow, BookRows } from '@/ui/Book';
import { Button, buttonStyle } from '@/ui/Button';
import { SelectField, TextField } from '@/ui/Field';
import { FlowView, type RefusalContext } from '@/ui/FlowView';
import { LedgerCorner, TallyEmpty } from '@/ui/Illustrations';
import { KeyChoice } from '@/ui/KeyChoice';
import { Notice } from '@/ui/Notice';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import { Slip } from '@/ui/Slip';
import { AsideCard, Work } from '@/ui/Work';
import { Gauge } from '@/ui/Gauge';

const flowFailed = (message: string): ShopFlowState => ({ step: 'failed', message });
const CURRENCIES = ['₦', 'S/', 'R$', '$'];
const units = (n: bigint) => Number(n) / 10_000_000;

export default function ShopApp() {
  const custody = useCustody('shop');
  return (
    <Shell>
      {custody.status === 'loading' && <p>Loading…</p>}
      {custody.status === 'none' && <Setup custody={custody} />}
      {(custody.status === 'locked' || (custody.status === 'ready' && !custody.kp)) && <Locked custody={custody} />}
      {custody.status === 'ready' && custody.kp && <Ready custody={custody} kp={custody.kp} />}
    </Shell>
  );
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
    <Work
      aside={
        <AsideCard title="What you are creating">
          <p>A shop credit book on the Stellar test network. Your customers sign each purchase on their own phone.</p>
          <p>The credit limit you set for each customer is kept by the network, so a purchase over it is refused.</p>
          <p className={u.meta}>Your key stays on this device. We never see it.</p>
        </AsideCard>
      }
    >
      <Slip title="Open your shop">
        <form onSubmit={submit}>
          <TextField label="Shop name" data-testid="shop-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" required />
          <SelectField label="Currency your customers pay in" data-testid="shop-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />
          <Button type="submit" variant="primary" data-testid="create-shop" busy={custody.busy}>
            {custody.busy ? 'Creating…' : 'Create my shop'}
          </Button>
          {(problem ?? custody.error) && (
            <Notice tone="problem" data-testid="setup-error">
              {problem ?? custody.error}
            </Notice>
          )}
        </form>
        <p className={u.meta} style={{ marginTop: 16 }}>
          This runs on the Stellar test network. No real money is involved.
        </p>
      </Slip>
    </Work>
  );
}

function Locked({ custody }: { custody: Custody }) {
  return (
    <Work>
      <Slip title="Welcome back">
        <p>Unlock your shop with your passkey.</p>
        <Button variant="primary" data-testid="unlock-shop" busy={custody.busy} onClick={() => void custody.unlock()}>
          {custody.busy ? 'Unlocking…' : 'Unlock'}
        </Button>
        {custody.error && <Notice tone="problem">{custody.error}</Notice>}
      </Slip>
    </Work>
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
  const [adding, setAdding] = useState(false);

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
      <Work>
        <Slip title="Setting up your shop">
          <Notice tone="pending" data-testid="setup-progress">
            {progress || 'Checking your shop…'}
          </Notice>
        </Slip>
      </Work>
    );
  }
  if (phase === 'error') {
    return (
      <Work>
        <Slip title="Setting up your shop">
          <Notice tone="problem">{problem}</Notice>
          <Button variant="primary" onClick={() => void finishSetup()}>
            Try again
          </Button>
        </Slip>
      </Work>
    );
  }

  const rows = data?.book.rows ?? [];
  const out = rows.reduce((t, r) => t + r.owed, 0n);
  const late = rows.reduce((t, r) => t + r.overdueAmount, 0n);

  return (
    <div data-testid="shop-ready">
      <Book
        title={shopName}
        titleTestId="shop-title"
        meta={
          <p style={{ margin: 0 }}>
            {rows.length === 0
              ? 'Nobody owes you yet.'
              : `${rows.length} ${rows.length === 1 ? 'customer owes' : 'customers owe'} ${formatAmount(out, currency)}`}
            {late > 0n && <span className={u.late}> · {formatAmount(late, currency)} past due</span>}
          </p>
        }
        action={
          !adding && (
            <Button variant="primary" data-testid="add-customer" onClick={() => setAdding(true)}>
              Add a customer
            </Button>
          )
        }
        aside={
          <div className={u.asideCard}>
            <h2>Your book</h2>
            <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
              <div className={u.stat}>
                <dt>Customers</dt>
                <dd>{rows.length}</dd>
              </div>
              <div className={u.stat}>
                <dt>Owed to you</dt>
                <dd>{formatAmount(out, currency)}</dd>
              </div>
              <div className={u.stat}>
                <dt>Past due</dt>
                <dd className={late > 0n ? u.late : undefined}>{formatAmount(late, currency)}</dd>
              </div>
            </dl>
            <LedgerCorner className={u.art} />
            <p className={u.meta} style={{ margin: 0 }}>
              Testnet · {shortKey(pub)}
            </p>
          </div>
        }
      >
        {adding && <AddCustomer kp={kp} currency={currency} shopName={shopName} onDone={refresh} onClose={() => setAdding(false)} />}

        {readError && (
          <Notice tone="problem" data-testid="read-error">
            Could not read the latest ({readError}). {data ? 'Showing what was last read.' : ''}
          </Notice>
        )}

        {data && rows.length === 0 && !adding && (
          <div className={u.empty} data-testid="book-empty">
            <TallyEmpty className={u.emptyArt} />
            <p>No customers yet. Add your first customer to start the book.</p>
          </div>
        )}

        <BookRows testId="book">
          {rows.map((row) => (
            <Customer key={row.customer} kp={kp} row={row} currency={currency} shopName={shopName} onDone={refresh} />
          ))}
        </BookRows>

        <div className={u.actions}>
          <Button variant="quiet" data-testid="refresh" onClick={() => void refresh()}>
            Refresh
          </Button>
          {lastRead && (
            <span className={u.meta} data-testid="last-read">
              Updated {lastRead} UTC
            </span>
          )}
        </div>
      </Book>
    </div>
  );
}

function AddCustomer({
  kp,
  currency,
  shopName,
  onDone,
  onClose,
}: {
  kp: Keypair;
  currency: string;
  shopName: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
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
    <div className={u.panel} style={{ marginBottom: 24 }}>
      <Slip title="Add a customer">
        {!state && (
          <form onSubmit={go}>
            <TextField
              label={`Credit limit for this customer (${currency})`}
              hint="The most they can owe you at once. The network enforces it."
              data-testid="join-limit"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              error={problem}
            />
            <div className={u.actions} style={{ marginTop: 0 }}>
              <Button type="submit" variant="primary" data-testid="start-join">
                Show join code
              </Button>
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        <FlowView
          state={state}
          onClose={() => {
            cancel();
            onClose();
          }}
        />
      </Slip>
    </div>
  );
}

type Panel = 'sale' | 'repay' | 'limit' | 'writeoff' | 'close' | null;

function Customer({ kp, row, currency, shopName, onDone }: { kp: Keypair; row: Row; currency: string; shopName: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState<Panel>(null);
  const oldest = row.oldestUnpaid;
  const toggle = (p: Exclude<Panel, null>) => setOpen(open === p ? null : p);
  const reminder = reminderText({ shopName, row, currency, today: todayUtc() });
  const label = `${formatAmount(row.owed, currency)} owed of a ${formatAmount(row.limit, currency)} limit`;

  return (
    <BookRow testId="book-row" mark={row.overdue ? 'late' : row.owed === 0n ? 'clear' : undefined}>
      <div className={u.top}>
        <span className={u.name} data-testid="row-name">
          {row.name ?? shortKey(row.customer)}
        </span>
        <span className={u.owed} data-testid="row-owed">
          {formatAmount(row.owed, currency)}
        </span>
      </div>
      <Gauge owed={units(row.owed)} limit={units(row.limit)} label={label} />
      <p className={u.meta}>
        Limit <span data-testid="row-limit">{formatAmount(row.limit, currency)}</span> · <span data-testid="row-headroom">{formatAmount(row.headroom, currency)}</span> left
      </p>
      {oldest && (
        <p className={u.meta}>
          Oldest unpaid: {oldest.item}
          {oldest.due ? ` · due ${formatDate(oldest.due)}` : ''} {row.overdue && <span className={u.late}>· overdue</span>}
        </p>
      )}
      {!row.explained && <p className={u.meta}>Some of this customer’s history is missing. The balance shown is what the network holds.</p>}

      <div className={u.actions}>
        <Button data-testid="open-sale" onClick={() => toggle('sale')} aria-expanded={open === 'sale'}>
          New purchase
        </Button>
        <Button data-testid="open-repay" onClick={() => toggle('repay')} aria-expanded={open === 'repay'}>
          Cash repayment
        </Button>
        {reminder && (
          <a {...buttonStyle('quiet')} data-testid="remind" href={whatsappLink(reminder)} target="_blank" rel="noreferrer">
            Remind on WhatsApp
          </a>
        )}
        <details className={u.more}>
          <summary {...buttonStyle('quiet')} data-testid="open-more">
            More
          </summary>
          <Button variant="quiet" data-testid="open-limit" onClick={() => toggle('limit')}>
            Change limit
          </Button>
          <Button variant="quiet" data-testid="open-writeoff" onClick={() => toggle('writeoff')}>
            Write off
          </Button>
          <Button variant="quiet" data-testid="open-close" onClick={() => toggle('close')}>
            Close line
          </Button>
        </details>
      </div>

      {open === 'sale' && <SalePanel kp={kp} row={row} currency={currency} onDone={onDone} />}
      {open === 'repay' && <RepayPanel kp={kp} row={row} currency={currency} onDone={onDone} />}
      {open === 'limit' && (
        <ActionPanel
          testid="limit"
          id={`limit-${row.customer}`}
          title="Change the limit"
          label={`New limit (${currency})`}
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
          title="Write off"
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
          title="Close this line"
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
    </BookRow>
  );
}

/** One small slip: an optional field, a button, and the outcome in words. */
function ActionPanel({
  testid,
  id,
  title,
  label,
  button,
  hint,
  run,
}: {
  testid: string;
  id: string;
  title: string;
  label?: string;
  button: string;
  hint?: string;
  run: (value: string) => Promise<string>;
}) {
  const [value, setValue] = useState('');
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
    <div className={u.panel}>
      <Slip title={title}>
        <form onSubmit={submit}>
          {hint && <p className={u.meta}>{hint}</p>}
          {label && <TextField id={id} label={label} data-testid={`${testid}-input`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
          <Button type="submit" variant="primary" data-testid={`${testid}-submit`} busy={busy}>
            {busy ? 'Working…' : button}
          </Button>
          {result && (
            <Notice tone={result.ok ? 'ok' : 'problem'} data-testid={`${testid}-result`}>
              {result.text}
            </Notice>
          )}
        </form>
      </Slip>
    </div>
  );
}

function SalePanel({ kp, row, currency, onDone }: { kp: Keypair; row: Row; currency: string; onDone: () => Promise<void> }) {
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(daysFromNow(7));
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<bigint>(0n);
  const { state, start, cancel } = useFlow<ShopFlowState>(flowFailed);
  const step = state?.step;

  useEffect(() => {
    if (step === 'done' || step === 'refused') void onDone();
  }, [step, onDone]);

  const parsed = parseMoney(amount);
  const over = parsed !== null && toStroops(parsed) > row.headroom;
  const refusal: RefusalContext = { owed: row.owed, limit: row.limit, attempt, currency };

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
    setAttempt(toStroops(parsed));
    start((emit, signal) =>
      runSale(kp, { customer: row.customer, amount: parsed, item: item.trim(), due: due || undefined, currency, origin: window.location.origin }, emit, signal),
    );
  }

  return (
    <div className={u.panel}>
      <Slip title={`New purchase for ${row.name ?? shortKey(row.customer)}`}>
        {!state && (
          <form onSubmit={show}>
            <TextField label="What is being bought" data-testid="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Rice 2 bags" required />
            <TextField label={`Amount (${currency})`} data-testid="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <TextField label="Due date" data-testid="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            {over && (
              <Notice tone="pending" data-testid="over-limit-hint">
                This is over the limit ({formatAmount(row.headroom, currency)} left). The network will refuse it.
              </Notice>
            )}
            <Button type="submit" variant="primary" data-testid="show-sale-code">
              Show purchase code
            </Button>
            {problem && <Notice tone="problem">{problem}</Notice>}
          </form>
        )}
        <FlowView state={state} onClose={cancel} refusal={refusal} />
      </Slip>
    </div>
  );
}

function RepayPanel({ kp, row, currency, onDone }: { kp: Keypair; row: Row; currency: string; onDone: () => Promise<void> }) {
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
    <div className={u.panel}>
      <Slip title="Cash repayment">
        <form onSubmit={submit}>
          <TextField label={`Cash received (${currency})`} data-testid="repay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button type="submit" variant="primary" data-testid="repay-submit" busy={busy}>
            {busy ? 'Recording…' : 'Record repayment'}
          </Button>
          {result && (
            <Notice tone={result.ok ? 'ok' : 'problem'} data-testid="repay-result">
              {result.text}
            </Notice>
          )}
        </form>
      </Slip>
    </div>
  );
}
