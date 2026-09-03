import { expect, test } from './fixtures';

/*
 * The built SPA served by the Worker from one origin, which production is and the dev server is
 * not: inlined env, the SPA fallback, and the assets binding only exist on this path.
 */
const ORIGIN = 'http://localhost:34100';

test.describe('the built app, served the way production serves it', () => {
  test('renders the sign-in page from the bundle, with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`${ORIGIN}/login`);
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  /* An unknown path has to reach the SPA, or a deep link into any app route 404s on a reload. */
  test('hands an unknown path to the SPA rather than 404ing', async ({ page }) => {
    const res = await page.goto(`${ORIGIN}/account`);
    expect(res?.status()).toBe(200);
    // Signed out, the account page sends you to sign in.
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  test('serves the API from the same origin as the page', async ({ request }) => {
    const res = await request.get(`${ORIGIN}/auth/me`);
    expect(res.status()).toBe(401);
  });

  /* Static assets are what the bundle asks for by name; a miss here is a blank page in production. */
  test('serves the hashed assets the page references', async ({ page, request }) => {
    await page.goto(`${ORIGIN}/login`);
    const src = await page.locator('script[type="module"]').first().getAttribute('src');
    expect(src).toMatch(/^\/assets\/.+\.js$/);
    expect((await request.get(`${ORIGIN}${src}`)).status()).toBe(200);
  });
});
