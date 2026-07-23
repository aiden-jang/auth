import type { ReactNode } from 'react';

/** A shimmering placeholder block. Compose several to mimic the shape of loading content. */
export function Skeleton({ className }: { className?: string }): ReactNode {
  return <div className={`skeleton rounded-md ${className ?? ''}`} aria-hidden />;
}
