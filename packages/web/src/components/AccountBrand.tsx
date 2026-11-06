import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

export function Wordmark({ accounts = false }: { accounts?: boolean }): ReactNode {
  return (
    <a
      href="/"
      className="inline-flex max-w-full flex-wrap items-center gap-x-[8px] gap-y-1 font-semibold tracking-tight transition-opacity hover:opacity-80"
    >
      <BrandMark /> <span translate="no">aidenjang</span>
      {accounts && <span className="wordmark-section">Accounts</span>}
    </a>
  );
}

export function MadeBy({ className }: { className?: string }): ReactNode {
  return (
    <p className={className}>
      made by{' '}
      <a
        href="https://www.aidenjang.com"
        target="_blank"
        aria-describedby="external-link-hint"
        rel="noreferrer"
        className="hover:text-accent hover:underline"
      >
        aiden jang
      </a>
    </p>
  );
}
