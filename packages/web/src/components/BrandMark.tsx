import type { ReactNode } from 'react';

/*
 * Keep in step with public/favicon.svg: same mark, and nothing fails if the two drift apart.
 * The bow is a stroked ring so its hole is really transparent and the tile shows through.
 */
export function BrandMark(): ReactNode {
  return (
    <span
      aria-hidden
      className="inline-grid h-8 w-8 place-items-center rounded-[10px]"
      style={{ background: '#aacbfa' }}
    >
      <svg width="20" height="20" viewBox="0 0 512 512" fill="none" aria-hidden>
        <g transform="rotate(45 256 256)" fill="#14171c" fillOpacity="0.92">
          <circle
            cx="256"
            cy="152"
            r="57"
            fill="none"
            stroke="#14171c"
            strokeOpacity="0.92"
            strokeWidth="46"
          />
          <rect x="240" y="210" width="32" height="200" rx="8" />
          <rect x="272" y="322" width="48" height="28" rx="6" />
          <rect x="272" y="368" width="34" height="26" rx="6" />
        </g>
      </svg>
    </span>
  );
}
