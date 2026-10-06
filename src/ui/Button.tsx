import type { ButtonHTMLAttributes } from 'react';
import s from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** One filled (primary) button per view; peers stay secondary. */
  variant?: ButtonVariant;
  /** Shows a spinner and disables the button while work is in flight. */
  busy?: boolean;
  tone?: 'neutral' | 'success' | 'error';
};

export function Button({ variant = 'secondary', busy = false, tone = 'neutral', type = 'button', disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-variant={variant}
      data-tone={tone}
      className={className ? `${s.button} ${className}` : s.button}
    >
      {busy && <span className={s.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}

/** For links that should look like a button: spread onto a Next `Link` or an `a`. */
export const buttonStyle = (variant: ButtonVariant = 'secondary') => ({ className: s.button, 'data-variant': variant, 'data-tone': 'neutral' }) as const;
