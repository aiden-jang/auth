import { test as base } from '@playwright/test';

/*
 * A distinct client address per test, because rate limits key on cf-connecting-ip and local dev
 * never sets one. The name keeps tests apart from each other, the run byte keeps a run apart from
 * earlier runs -- drop either and something spends another's registration budget.
 *
 * Local only: in production Cloudflare sets this header and a caller cannot pick a bucket.
 */
const RUN = Math.floor(Date.now() / 1000) % 251;

function addressFor(title: string): string {
  let h = 7;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 0xffff;
  return `10.${RUN + 1}.${(h >> 8) & 255}.${h & 255 || 1}`;
}

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    await context.setExtraHTTPHeaders({
      'cf-connecting-ip': addressFor(testInfo.titlePath.join('/')),
    });
    await use(context);
  },
});

export { expect, type Page } from '@playwright/test';
