import { test as base } from '@playwright/test';

/*
 * A distinct client address per test.
 *
 * Rate limits are keyed on cf-connecting-ip, which local dev never sets, so every test in the suite
 * would otherwise share one bucket: registration allows ten an hour and this suite registers more
 * than that, so tests began failing on "too many attempts" in whatever order they happened to run.
 * Two parts, and both are needed. The test's own name keeps tests independent of each other; the
 * per-run byte keeps a run independent of the runs before it. Drop the run byte and every run
 * reuses the same addresses, so ten runs in an hour spend one registration budget and the suite
 * starts failing on "too many attempts".
 *
 * Local-only. In production Cloudflare sets this header itself and a caller cannot pick a bucket.
 */
const RUN = Math.floor(Date.now() / 1000) % 251;

function addressFor(title: string): string {
  let h = 7;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 0xffff;
  return `10.${RUN + 1}.${(h >> 8) & 255}.${h & 255 || 1}`;
}

export const test = base.extend({
  context: async ({ browser }, use, testInfo) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { 'cf-connecting-ip': addressFor(testInfo.titlePath.join('/')) },
    });
    await use(context);
    await context.close();
  },
});

export { expect, type Page } from '@playwright/test';
