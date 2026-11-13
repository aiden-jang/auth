import { useState, type ReactNode } from 'react';
import { authApi } from '../lib/api';
import { AccountIcon } from './AccountIcon';

/*
 * "Take a copy of everything." Its own component because the whole feature is one button, one
 * request and a filename -- and because a download that half-works is the kind of thing that only
 * shows up when somebody actually clicks it.
 */
export function ExportAccount(): ReactNode {
  const [exportStatus, setExportStatus] = useState<'exporting' | 'downloaded' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadAccountData(): Promise<void> {
    if (exportStatus) return;
    setExportStatus('exporting');
    setExportError(null);
    try {
      const data = await authApi.exportAccount();
      const href = URL.createObjectURL(
        new Blob([`${JSON.stringify(data, null, 2)}\n`], {
          type: 'application/json;charset=utf-8',
        }),
      );
      const link = document.createElement('a');
      link.href = href;
      link.download = `aidenjang-account-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setExportStatus('downloaded');
      window.setTimeout(() => setExportStatus(null), 2200);
    } catch {
      setExportStatus(null);
      setExportError('Couldn’t prepare your account data. Try again.');
    }
  }

  return (
    <section aria-labelledby="your-data-heading" id="account-data" className="hub-section hub-data">
      <div>
        <h2 id="your-data-heading" className="sr-only">
          Your data
        </h2>
        <p className="hub-data-description">
          Download your profile, sign-in methods, active devices, and security history as JSON.
          Passwords and session credentials are never included.
        </p>
        {exportError && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-neg">
            {exportError}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void downloadAccountData()}
        disabled={exportStatus !== null}
        className="hub-outline disabled:cursor-default disabled:opacity-60"
      >
        <AccountIcon kind="download" />
        {exportStatus === 'exporting'
          ? 'Preparing…'
          : exportStatus === 'downloaded'
            ? 'Download started'
            : 'Download copy'}
      </button>
    </section>
  );
}
