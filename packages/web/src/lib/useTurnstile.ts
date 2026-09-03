import { useCallback, useState } from 'react';

/* A token is spent the moment the server checks it, so keeping it for a retry gets the form
   refused again for a reason that has nothing to do with what the person typed. */
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
