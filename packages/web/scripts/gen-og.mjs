import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { openSync } from 'fontkit';

const pub = resolve(import.meta.dirname, '../public');
const regular = openSync(resolve(pub, 'fonts/dm-sans-400.woff2'));
const bold = openSync(resolve(pub, 'fonts/dm-sans-700.woff2'));

// Outline bundled fonts so crawlers and the rasterizer need no external font service.
function text(value, x, y, size, color, font = regular) {
  const run = font.layout(value);
  let cursor = 0;
  const paths = run.glyphs.map((glyph, i) => {
    const at = run.positions[i];
    const path = `<path transform="translate(${cursor + at.xOffset} ${at.yOffset})" d="${glyph.path.toSVG()}"/>`;
    cursor += at.xAdvance;
    return path;
  });
  const scale = size / font.unitsPerEm;
  return `<g fill="${color}" transform="translate(${x} ${y}) scale(${scale} ${-scale})">${paths.join('')}</g>`;
}

const mark = readFileSync(resolve(pub, 'favicon.svg'), 'utf8').replace(/<svg[^>]*>|<\/svg>/g, '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
<title id="title">aidenjang accounts — One account. Fewer keys.</title>
<desc id="desc">An ice-blue key on slate and cool paper. One login for all of aidenjang’s apps.</desc>
<rect width="1200" height="630" fill="#14171c"/>
<path d="M80 151H1120" stroke="#353d49"/>
${text('aidenjang', 80, 107, 30, '#edf1f7', bold)}
${text('/ accounts', 243, 107, 22, '#a7b0bd')}
${text('One account.', 80, 265, 70, '#edf1f7', bold)}
${text('Fewer keys.', 80, 344, 70, '#aacbfa', bold)}
${text('One login for all of', 83, 414, 26, '#a7b0bd')}
${text('aidenjang’s apps.', 83, 452, 26, '#a7b0bd')}
${text('accounts.aidenjang.com', 83, 554, 20, '#a7b0bd')}
<rect x="792" y="202" width="328" height="352" rx="36" fill="#edf1f7"/>
<svg x="842" y="246" width="228" height="228" viewBox="0 0 512 512">${mark}</svg>
</svg>`;
writeFileSync(resolve(pub, 'og.svg'), svg);
const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
writeFileSync(resolve(pub, 'og.png'), png);
console.log(`wrote og.svg and og.png (1200x630, ${png.length.toLocaleString()} bytes)`);
