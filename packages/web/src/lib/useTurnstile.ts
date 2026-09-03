import { useCallback, useState } from 'react';

/*
 * The Turnstile token for one form, and discarding it after a failed submit.
 *
 * A token is spent the moment the server checks it, so a form that keeps the old one on a retry
 * sends something already used and is refused a second time for a reason that has nothing to do
 * with what the person typed. Bumping `resetSignal` makes the widget solve a fresh one.
 */
export interface TurnstileField {
  token: string;
  setToken: (token: string) => void;
  resetSignal: number;
  /** Call after a rejected submit, so a retry carries a token the server has not seen. */
  discard: () => void;
}

export function useTurnstile(): TurnstileField {
  const [token, setToken] = useState('');
  const [resetSignal, setResetSignal] = useState(0);

  const discard = useCallback(() => {
    setToken('');
    setResetSignal((n) => n + 1);
  }, []);

  return { token, setToken, resetSignal, discard };
}
