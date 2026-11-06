import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { authApi, type SessionInfo } from './api';

/* A hook, not state inside SessionList: the security-review banner signs the other devices out, so
   both need the same copy. */
export interface Sessions {
  list: SessionInfo[] | null;
  error: string | null;
  refreshing: boolean;
  justRefreshed: boolean;
  revokingId: string | null;
  revokingOthers: boolean;
  expandedId: string | null;
  renamingId: string | null;
  nameDraft: string;
  savingName: boolean;
  setExpandedId: (id: string | null) => void;
  setNameDraft: (value: string) => void;
  refresh: (manual?: boolean) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  revokeOthers: (options?: { reportError?: boolean }) => Promise<boolean>;
  beginRename: (session: SessionInfo) => void;
  cancelRename: () => void;
  rename: (event: FormEvent, id: string) => Promise<void>;
}

export function useSessions(): Sessions {
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  // An older GET must not undo a successful rename or device sign-out.
  const latestRefresh = useRef(0);
  const revision = useRef(0);

  const refresh = useCallback(async (manual = false): Promise<void> => {
    const request = ++latestRefresh.current;
    const snapshot = revision.current;
    const current = (): boolean =>
      request === latestRefresh.current && snapshot === revision.current;
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const result = await authApi.listSessions();
      if (!current()) return;
      setList(result.sessions);
      if (manual) {
        setJustRefreshed(true);
      }
    } catch {
      if (!current()) return;
      // Preserve a previously loaded list. A refresh failure should not make every known session
      // disappear and falsely imply that no devices are signed in.
      setError('Couldn’t refresh active devices. Try again.');
    } finally {
      if (manual && request === latestRefresh.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // refresh() clears the error before it fetches, which is a real synchronous setState. Worth one
    // render on mount rather than showing a stale failure over a list being reloaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      latestRefresh.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (!justRefreshed) return;
    const timer = window.setTimeout(() => setJustRefreshed(false), 1800);
    return () => window.clearTimeout(timer);
  }, [justRefreshed]);

  const revoke = useCallback(async (id: string): Promise<void> => {
    setRevokingId(id);
    setError(null);
    try {
      await authApi.revokeSession(id);
      revision.current += 1;
      setJustRefreshed(false);
      setList((s) => s?.filter((x) => x.id !== id) ?? null);
      setExpandedId((current) => (current === id ? null : current));
    } catch {
      setError('Couldn’t sign that device out. Try again.');
    } finally {
      setRevokingId(null);
    }
  }, []);

  const revokeOthers = useCallback(async ({ reportError = true } = {}): Promise<boolean> => {
    setRevokingOthers(true);
    setError(null);
    try {
      await authApi.revokeOtherSessions();
      revision.current += 1;
      setJustRefreshed(false);
      setList((s) => s?.filter((x) => x.current) ?? null);
      return true;
    } catch {
      if (reportError) setError('Couldn’t sign the other devices out. Try again.');
      return false;
    } finally {
      setRevokingOthers(false);
    }
  }, []);

  const beginRename = useCallback((session: SessionInfo): void => {
    setRenamingId(session.id);
    setNameDraft(session.device ?? '');
    setError(null);
  }, []);

  const cancelRename = useCallback((): void => {
    setRenamingId(null);
    setNameDraft('');
  }, []);

  const rename = useCallback(
    async (event: FormEvent, id: string): Promise<void> => {
      event.preventDefault();
      const label = nameDraft.trim();
      if (!label) return;
      setSavingName(true);
      setError(null);
      try {
        const { session } = await authApi.renameSession(id, label);
        revision.current += 1;
        setJustRefreshed(false);
        setList(
          (current) =>
            current?.map((item) => (item.id === id ? { ...item, device: session.device } : item)) ??
            null,
        );
        setRenamingId(null);
        setNameDraft('');
      } catch {
        setError('Couldn’t rename that device. Try again.');
      } finally {
        setSavingName(false);
      }
    },
    [nameDraft],
  );

  return {
    list,
    error,
    refreshing,
    justRefreshed,
    revokingId,
    revokingOthers,
    expandedId,
    renamingId,
    nameDraft,
    savingName,
    setExpandedId,
    setNameDraft,
    refresh,
    revoke,
    revokeOthers,
    beginRename,
    cancelRename,
    rename,
  };
}
