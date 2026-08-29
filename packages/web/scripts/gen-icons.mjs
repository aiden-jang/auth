// Rasterize public/favicon.svg into the PNG sizes iOS, Android, and link unfurlers expect, since
// several of those surfaces ignore SVG icons. The PNGs are committed, so re-run this after every
// edit to the SVG: `pnpm --filter @aidenjang/auth-web gen:icons`.
//
// Without it the two drift silently. owewell hit exactly that — its mark was redrawn, its PNGs were
// not, and every browser tab kept showing the old design until somebody noticed months later.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const pub = resolve(import.meta.dirname, '..', 'public');
const svg = readFileSync(resolve(pub, 'favicon.svg'), 'utf8');

// iOS and Android apply their own rounded mask and composite any transparency to black, so a
// pre-rounded icon with see-through corners renders with black corners or vanishes from the iOS
// share sheet. Those two need a full-bleed opaque square; the plain favicon keeps its rounding.
const fullBleed = svg.replace('rx="120"', 'rx="0"');

const targets = [
  ['apple-touch-icon.png', 180, fullBleed],
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, fullBleed],
];

for (const [name, size, source] of targets) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(resolve(pub, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length.toLocaleString()} bytes)`);
}
