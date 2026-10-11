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
      style={{ background: '#14171c' }}
    >
      <svg width="20" height="20" viewBox="0 0 512 512" fill="none" aria-hidden>
        <g transform="rotate(-40 256 256)" fill="#aacbfa">
          <path
            fillRule="evenodd"
            d="M256 76a100 100 0 1 1 0 200 100 100 0 0 1 0-200Zm0 62a38 38 0 1 0 0 76 38 38 0 0 0 0-76Z"
          />
          <path d="M226 244h60v90h58v46h-58v46h-60Z" />
        </g>
      </svg>
    </span>
  );
}
