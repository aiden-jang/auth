import type { ReactNode } from 'react';
import { maskEmail, recentAccountTimeLabel, type RecentAccount } from '../lib/recentAccount';
import { AccountIcon } from './AccountIcon';

export function RecentAccounts({
  accounts,
  onChoose,
  onForget,
}: {
  accounts: RecentAccount[];
  onChoose: (email: string) => void;
  onForget: (email: string) => void;
}): ReactNode {
  return (
    <ul className="recent-accounts" aria-label="Accounts remembered on this device">
      {accounts.map((account) => (
        <li key={account.email}>
          <button
            type="button"
            className="recent-account-choice"
            onClick={() => onChoose(account.email)}
            title={`Continue as ${account.email}`}
          >
            <span aria-hidden className="account-avatar">
              {account.email.slice(0, 2)}
            </span>
            <span className="recent-account-copy">
              <strong>{maskEmail(account.email)}</strong>
              <small>{recentAccountTimeLabel(account.lastUsedAt)}</small>
            </span>
            <span className="recent-account-continue">Continue</span>
          </button>
          <button
            type="button"
            className="recent-forget"
            onClick={() => onForget(account.email)}
            aria-label={`Forget ${account.email} on this device`}
          >
            <AccountIcon kind="close" />
          </button>
        </li>
      ))}
    </ul>
  );
}
