import { expect, test, type Page } from './fixtures';
import { linkEmailedTo } from './mail';

/* Forgetting a password and getting back in: the one flow where a break locks people out with no
   way round it. */

const password = 'correct horse battery staple';

function freshEmail(): string {
  return `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
}

async function register(page: Page): Promise<string> {
  const email = freshEmail();
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Forgetful Person');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Confirm email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  return email;
}

async function askForReset(page: Page, email: string): Promise<void> {
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  // Wait for the confirmation itself, not `role="status"`: the reassurance line under the form
  // carries that role too, so it resolves while the request is still in flight and a caller can
  // read "Sending..." as though it were the answer.
  await expect(page.getByText('check that inbox')).toBeVisible();
}

test('reset a forgotten password and sign in with the new one', async ({ page }) => {
  const email = await register(page);
  const next = 'an entirely different passphrase';

  await askForReset(page, email);
  await page.goto(await linkEmailedTo(email, '/reset-password'));

  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page.getByRole('button', { name: 'Set new password' }).click();

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
});

/* The old password has to stop working, or a reset does not recover an account somebody else knows
   the password to -- which is the reason most people reset one. */
test('the old password stops working once it has been reset', async ({ page }) => {
  const email = await register(page);
  const next = 'yet another passphrase entirely';

  await askForReset(page, email);
  await page.goto(await linkEmailedTo(email, '/reset-password'));
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page.getByRole('button', { name: 'Set new password' }).click();

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

/* A link sits in an inbox indefinitely. Spending it once is what stops whoever reaches that mailbox
   later from replaying it. */
test('a reset link cannot be used twice', async ({ page }) => {
  const email = await register(page);
  const link = await (async () => {
    await askForReset(page, email);
    return linkEmailedTo(email, '/reset-password');
  })();

  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill('first new passphrase');
  await page.getByLabel('Confirm new password').fill('first new passphrase');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('button', { name: 'Set new password' })).toBeHidden();

  await page.goto(link);
  await page.getByLabel('New password', { exact: true }).fill('second new passphrase');
  await page.getByLabel('Confirm new password').fill('second new passphrase');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

/*
 * Asking about an address with no account must look exactly like asking about one that has an
 * account, or the form becomes a way to find out who has signed up.
 */
test('says the same thing whether or not the address has an account', async ({ page }) => {
  const real = await register(page);
  const unknown = `nobody-${Date.now()}@test.dev`;

  // The page echoes the address back, so that one span differs by construction. Mask it and
  // compare the wording around it, which is the part that must not reveal whether the account
  // exists. Comparing raw text passed for years by catching both pages mid-request instead.
  const wording = (text: string, email: string) => text.replaceAll(email, '{address}');

  await askForReset(page, real);
  const forKnown = wording(await page.locator('main').innerText(), real);

  await askForReset(page, unknown);
  const forUnknown = wording(await page.locator('main').innerText(), unknown);

  expect(forUnknown).toBe(forKnown);
});
