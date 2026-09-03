import { expect, test, type Page } from './fixtures';
import { linkEmailedTo } from './mail';

/*
 * Register, confirm the emailed link, sign out, sign back in. The unit suites know every route
 * answers correctly; only this knows whether a person can get through them in a browser.
 */

const password = 'correct horse battery staple';

function freshEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
}

/*
 * The verification link, read out of the worker's own log.
 *
 * The database stores only the hash of a token, so the raw one exists nowhere but the mail. With
 * no RESEND_API_KEY the worker prints it instead of sending, which is the only way for a test to
 * follow the link a real person clicks.
 */
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('E2E Person');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Confirm email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('register, verify by the emailed link, sign out and back in', async ({ page }) => {
  const email = freshEmail();

  await signUp(page, email);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  // A brand-new account has not proved its address yet, and the page says so.
  await expect(page.getByText('unverified')).toBeVisible();

  await page.goto(await linkEmailedTo(email, '/verify-email'));
  await expect(page.getByText('Your email is verified. Nothing else to do.')).toBeVisible();

  await page.goto('/account');
  await expect(page.getByText('verified', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  /*
   * The session has to be gone on the server, not just off the screen. Asking for /account again
   * is what tells them apart: a cleared screen with a live cookie would still render it.
   */
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  // Verified once, still verified: confirming survives signing out.
  await expect(page.getByText('verified', { exact: true })).toBeVisible();
});

test('a wrong password says so and signs nobody in', async ({ page }) => {
  const email = freshEmail();
  await signUp(page, email);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
});

/* A link somebody re-clicked a week later has to say so, not sit on "Confirming...". */
test('a spent or bogus verification link fails plainly', async ({ page }) => {
  await page.goto('/verify-email?token=nothing-like-a-real-token');
  await expect(page.getByText('That verification link is invalid or expired.')).toBeVisible();
});

/* Every test runs in a fresh context, so this is the never-held-a-passkey case. */
test('a fresh browser is never asked for a passkey or a security key', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /passkey/i })).toHaveCount(0);
});
