import type { ReactNode } from 'react';

export function AccountArt({ kind }: { kind: 'mail' | 'device' }): ReactNode {
  return (
    <svg className="account-support-art" viewBox="0 0 80 72" fill="none" aria-hidden="true">
      <g stroke="#2d3c53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'mail' ? (
          <>
            <path d="m10 27 30-19 30 19v34H10Z" fill="#bccbdd" />
            <rect x="21" y="12" width="38" height="40" rx="4" fill="#e5ebf4" />
            <path d="M29 23h22M29 30h16" stroke="#667f9f" />
            <path d="m10 28 30 21 30-21v33H10Z" fill="#aacbfa" />
            <path d="m10 61 21-19m39 19L49 42" />
          </>
        ) : (
          <>
            <rect x="14" y="10" width="40" height="50" rx="6" fill="#bccbdd" />
            <path d="M21 18h26v28H21Z" fill="#e5ebf4" />
            <path d="M30 53h8" />
            <rect x="43" y="27" width="23" height="38" rx="5" fill="#aacbfa" />
            <path d="M49 33h11M52 59h5" />
            <circle cx="34" cy="30" r="5" fill="#aacbfa" />
            <path d="M34 35v6m0-2h4" />
          </>
        )}
      </g>
    </svg>
  );
}
