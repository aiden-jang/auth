import type { ReactNode } from 'react';

/*
 * The same key the browser tab shows (public/favicon.svg). Header and tab have to agree: this used
 * to draw a receipt, which is owewell's glyph, so the tab and the page advertised two different
 * products. Kept as a stroked ring rather than two stacked circles so the bit the key looks through
 * is genuinely transparent and picks up the tile gradient, exactly like the favicon does.
 *
 * The gradient is the aurora from index.css, the one behind every auth screen, not decoration
 * invented for the mark.
 */
export function BrandMark(): ReactNode {
  return (
    <span
      aria-hidden
      className="inline-grid h-8 w-8 place-items-center rounded-[10px]"
      style={{ background: 'linear-gradient(135deg, #a78bfa, #22d3ee)' }}
    >
      <svg width="20" height="20" viewBox="0 0 512 512" fill="none" aria-hidden>
        <g transform="rotate(45 256 256)" fill="#09090f" fillOpacity="0.92">
          <circle cx="256" cy="152" r="57" fill="none" stroke="#09090f" strokeOpacity="0.92" strokeWidth="46" />
          <rect x="240" y="210" width="32" height="200" rx="8" />
          <rect x="272" y="322" width="48" height="28" rx="6" />
          <rect x="272" y="368" width="34" height="26" rx="6" />
        </g>
      </svg>
    </span>
  );
}
