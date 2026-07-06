import { useState, type ReactNode } from 'react';
import { inputClass } from './AuthCard';

interface PasswordInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** Password managers: "current-password" for login, "new-password" for signup/reset. */
  autoComplete?: 'current-password' | 'new-password';
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}

/**
 * Password field with a show/hide toggle. Shared across login, signup, and
 * reset so the toggle behaves identically everywhere and password managers
 * get the right autocomplete hint.
 */
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = 'Password',
  required,
  autoFocus,
}: PasswordInputProps): ReactNode {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? 'text' : 'password'}
        className={`${inputClass} pr-11`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center text-muted transition hover:text-ink"
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7-.4 1-1.2 2.2-2.4 3.3M6.1 6.6C3.9 8 2.4 10 2 12c.7 1.9 3.5 6 10 6 1.2 0 2.3-.2 3.3-.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>
    </div>
  );
}
