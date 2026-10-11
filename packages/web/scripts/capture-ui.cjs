const { chromium } = require(
  process.env.AUTH_PLAYWRIGHT_MODULE || '../node_modules/@playwright/test',
);
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const dir = require('node:path').resolve(__dirname, '../../../docs/ui-qa');
  await fs.mkdir(dir, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.AUTH_BROWSER_PATH ? { executablePath: process.env.AUTH_BROWSER_PATH } : {}),
  });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    context.setDefaultTimeout(10000);
    let page;
    let signedIn = false;
    const errors = [];
    context.on('page', (opened) => opened.on('pageerror', (e) => errors.push(e.message)));
    await context.route('**/auth/**', (r) => {
      const p = new URL(r.request().url()).pathname;
      if (!p.startsWith('/auth/')) return r.continue();
      if (p === '/auth/me')
        return r.fulfill({
          status: signedIn ? 200 : 401,
          json: signedIn
            ? {
                user: {
                  id: 'visual-preview',
                  email: 'preview@example.test',
                  displayName: 'Preview',
                  emailVerified: true,
                  hasPassword: true,
                  hasGoogle: false,
                },
                sudoUntil: null,
              }
            : { error: 'UNAUTHENTICATED', message: 'Sign in first.' },
        });
      if (p === '/auth/sessions')
        return r.fulfill({
          json: {
            sessions: [
              {
                id: 'session-preview',
                current: true,
                device: 'Chrome on Mac',
                location: 'New York, United States',
                lastSeenAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                expiresAt: '2026-11-10T12:00:00Z',
              },
            ],
          },
        });
      if (p === '/auth/passkeys') return r.fulfill({ json: { passkeys: [] } });
      return r.fulfill({
        status: 400,
        json: { error: 'PREVIEW', message: 'This preview does not save changes.' },
      });
    });
    for (const [name, url, auth, title] of [
      ['login', '/login', false, 'Welcome back'],
      ['worth-login', '/login?return_to=https%3A%2F%2Fworth.aidenjang.com', false, 'Welcome back'],
      ['signup', '/signup', false, 'Create your account'],
      ['forgot', '/forgot-password', false, 'Reset your password'],
      ['reset', '/reset-password', false, null],
      ['verify', '/verify-email', false, null],
      ['account', '/account', true, 'Your account'],
      ['privacy', '/privacy', false, null],
      ['terms', '/terms', false, null],
    ]) {
      if (process.env.AUTH_UI_CASE && process.env.AUTH_UI_CASE !== name) continue;
      signedIn = auth;
      console.log('Checking', name);
      for (const width of [1440, 390, 320, 430, 768]) {
        page = await context.newPage();
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 780 });
        await page.goto('http://127.0.0.1:34112' + url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.locator('h1').waitFor();
        if (title) await page.getByRole('heading', { name: title, exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          name + ' overflow at ' + width,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: dir + '/' + name + '-' + width + '.png',
            fullPage: true,
            animations: 'disabled',
          });
        await page.close();
      }
    }
    assert.deepEqual(errors, []);
    console.log('Auth visual checks passed: no page errors or horizontal overflow.');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
