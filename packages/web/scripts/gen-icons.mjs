// iOS, Android and link unfurlers ignore SVG icons, so favicon.svg is also committed as PNGs.
// Run this after every edit to the SVG, or the tab keeps the old icon and nothing fails:
//   pnpm --filter @aidenjang/auth-web gen:icons
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const pub = resolve(import.meta.dirname, '..', 'public');
const svg = readFileSync(resolve(pub, 'favicon.svg'), 'utf8');

// iOS and Android round the corners themselves and paint anything see-through black, so an
// already-rounded icon comes out with black corners. Give those two a full square.
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
