'use client';

import type { RecordSummary } from '../book';
import { formatAmount, shortKey } from '../client/format';
import type { ShopProfiles } from '../client/reads';
import s from './ui.module.css';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A customer's record as plain facts. Never a score, and never a total across shops: each shop may use a
 * different currency, so amounts are shown per shop in that shop's own currency.
 */
export function RecordFacts({ record, shops }: { record: RecordSummary; shops: ShopProfiles }) {
  if (record.purchases === 0) {
    return <p data-testid="record-facts" className={s.muted}>No history yet. This is a first visit.</p>;
  }
  const days = record.medianDaysToRepay;
  return (
    <div data-testid="record-facts">
      <p>
        <strong data-testid="record-purchases">
          {plural(record.purchases, 'purchase', 'purchases')} at {plural(record.shops, 'shop', 'shops')}
        </strong>
      </p>
      <ul>
        <li>
          {record.settled} paid off
          {days !== null ? `, usually in ${plural(days, 'day', 'days')}` : ''}
        </li>
        {record.onTime + record.late > 0 && (
          <li>
            {record.onTime} paid by the due date, {record.late} after it
          </li>
        )}
        {record.overdueNow > 0 && <li>{record.overdueNow} past due now</li>}
        {record.writtenOff > 0 && <li>{record.writtenOff} written off by the shop</li>}
      </ul>
      <h3 className={s.muted} style={{ margin: '12px 0 4px' }}>By shop</h3>
      <ul className={s.list}>
        {record.perShop.map((p) => {
          const shop = shops[p.shop];
          const cur = shop?.currency ?? '₦';
          return (
            <li key={p.shop} data-testid="record-shop">
              <span className={s.name}>{shop?.name ?? shortKey(p.shop)}</span>
              <div className={s.muted}>
                {plural(p.purchases, 'purchase', 'purchases')} · bought {formatAmount(p.issued, cur)} · paid {formatAmount(p.repaid, cur)}
                {p.forgiven > 0n ? ` · written off ${formatAmount(p.forgiven, cur)}` : ''} · open {formatAmount(p.open, cur)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
