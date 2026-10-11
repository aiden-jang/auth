import type { ReactNode } from 'react';

/*
 * Keep in step with public/favicon.svg: same mark, and nothing fails if the two drift apart.
 * The bow uses an even-odd path so its hole stays transparent.
 */
export function BrandMark(): ReactNode {
  return (
    <span
      aria-hidden
      className="inline-grid h-8 w-8 place-items-center rounded-[10px]"
      style={{ background: '#aacbfa' }}
    >
      <svg width="20" height="20" viewBox="0 0 512 512" fill="none" aria-hidden>
        <g
          transform="translate(256 256) scale(1.12) rotate(45) translate(-256 -256)"
          fill="#14171c"
        >
          <path
            fillRule="evenodd"
            d="M256 68a84 84 0 1 1 0 168 84 84 0 0 1 0-168Zm0 54a30 30 0 1 0 0 60 30 30 0 0 0 0-60Z"
          />
          <rect x="232" y="214" width="48" height="192" rx="10" />
          <rect x="272" y="312" width="60" height="36" rx="7" />
          <rect x="272" y="368" width="44" height="36" rx="7" />
        </g>
      </svg>
    </span>
  );
}
