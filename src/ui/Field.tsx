'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import s from './field.module.css';

type Shared = { label: string; hint?: string; error?: string | null };

function describedBy(id: string, hint?: string, error?: string | null) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, hint, error, id, ...input }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={s.field}>
      <label htmlFor={fid} className={s.label}>
        {label}
      </label>
      <input {...input} id={fid} className={s.control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)} />
      {hint && (
        <p id={`${fid}-hint`} className={s.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-error`} role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({ label, hint, error, id, children, ...select }: Shared & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={s.field}>
      <label htmlFor={fid} className={s.label}>
        {label}
      </label>
      <select {...select} id={fid} className={s.control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, hint, error)}>
        {children}
      </select>
      {hint && (
        <p id={`${fid}-hint`} className={s.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-error`} role="alert" className={s.error}>
          {error}
        </p>
      )}
    </div>
  );
}
