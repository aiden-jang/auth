import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { authApi, type AuthUser } from '../lib/api';
import { inputClass } from './AuthCard';

export function AccountProfile({
  user,
  onUserChange,
}: {
  user: AuthUser;
  onUserChange: (user: AuthUser) => void;
}): ReactNode {
  const [verificationStatus, setVerificationStatus] = useState<'sending' | 'sent' | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  useEffect(() => {
    if (verificationStatus !== 'sent') return;
    const timer = window.setTimeout(() => setVerificationStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [verificationStatus]);
  useEffect(() => {
    if (!emailCopied) return;
    const timer = window.setTimeout(() => setEmailCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [emailCopied]);

  async function resendVerification(): Promise<void> {
    if (verificationStatus === 'sending') return;
    setVerificationStatus('sending');
    setVerificationError(null);
    try {
      await authApi.resendVerification();
      setVerificationStatus('sent');
    } catch (err) {
      setVerificationStatus(null);
      setVerificationError(
        err instanceof Error ? err.message : 'Couldn’t send the verification email.',
      );
    }
  }

  async function copyEmail(): Promise<void> {
    if (!user || emailCopied) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(user.email);
      setEmailCopied(true);
    } catch {
      setCopyError('Couldn’t copy the address. Select the email above and copy it manually.');
    }
  }

  function startEditName(): void {
    if (!user) return;
    setNameDraft(user.displayName);
    setNameError(null);
    setEditingName(true);
  }

  async function saveName(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (savingName) return;
    const next = nameDraft.trim();
    if (!next) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (next === user.displayName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const r = await authApi.updateProfile(next);
      onUserChange(r.user);
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSavingName(false);
    }
  }

  return (
    <section aria-label="Profile">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Profile</h2>
      <dl className="space-y-3 text-sm">
        {editingName ? (
          <div>
            <dt className="mb-1.5 text-muted">Name</dt>
            <form onSubmit={(e) => void saveName(e)} className="flex items-center gap-2">
              <input
                className={`${inputClass} min-w-0 flex-1`}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={80}
                autoFocus
                aria-label="Display name"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'profile-name-error' : undefined}
              />
              <button
                className="btn-primary shrink-0 cursor-pointer rounded-lg px-3.5 py-2.5 text-sm font-semibold disabled:opacity-60"
                disabled={savingName}
              >
                {savingName ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                disabled={savingName}
                onClick={() => setEditingName(false)}
                className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-2.5 text-sm text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </form>
            {nameError && (
              <p
                id="profile-name-error"
                role="alert"
                className="mt-1.5 text-xs font-medium text-neg"
              >
                {nameError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">Name</dt>
            <dd className="flex min-w-0 items-center gap-2 break-words font-medium">
              <span className="min-w-0 break-words">{user.displayName}</span>
              <button
                type="button"
                onClick={startEditName}
                className="min-h-11 shrink-0 cursor-pointer text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">{user.email}</span>
            <button
              type="button"
              onClick={() => void copyEmail()}
              className="min-h-11 shrink-0 text-xs font-medium text-accent hover:underline"
            >
              {emailCopied ? 'Copied' : 'Copy'}
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">Email status</dt>
          <dd>
            {user.emailVerified ? (
              <span className="rounded-full border border-pos/30 bg-pos/10 px-2.5 py-0.5 text-xs font-medium text-pos">
                verified
              </span>
            ) : (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">
                unverified
              </span>
            )}
          </dd>
        </div>
      </dl>

      {!user.emailVerified && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={verificationStatus !== null}
            className="text-sm font-medium text-accent hover:underline disabled:cursor-default disabled:opacity-60"
          >
            {verificationStatus === 'sending'
              ? 'Sending verification email…'
              : verificationStatus === 'sent'
                ? 'Verification email sent'
                : 'Resend verification email'}
          </button>
          {verificationError && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-neg">
              {verificationError}
            </p>
          )}
        </div>
      )}

      {copyError && (
        <p role="alert" className="mt-2 text-xs text-neg">
          {copyError}
        </p>
      )}
    </section>
  );
}
