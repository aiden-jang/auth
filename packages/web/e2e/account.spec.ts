import { expect, test, type Page } from './fixtures';

/*
 * The account page's own features, which the journey suite never touches. They assert what a person
 * sees and what survives a reload, not how the components are built.
 */

const password = 'correct horse battery staple';

function freshEmail(): string {
  return `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
}

async function registerAndLand(page: Page): Promise<string> {
  const email = freshEmail();
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Account Person');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Confirm email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  return email;
}

async function signIn(page: Page, email: string, pw: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.describe('the display name', () => {
  test('saves, and is still there after a reload', async ({ page }) => {
    await registerAndLand(page);

    await page.getByRole('button', { name: 'Edit' }).click();
    const field = page.getByLabel('Display name');
    await field.fill('Renamed Person');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Renamed Person')).toBeVisible();
    // Reloaded, because a name that only changed on screen has not been saved.
    await page.reload();
    await expect(page.getByText('Renamed Person')).toBeVisible();
  });

  test('refuses an empty name rather than saving a blank one', async ({ page }) => {
    await registerAndLand(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Display name').fill('   ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.reload();
    await expect(page.getByText('Account Person')).toBeVisible();
  });
});

test.describe('changing the password', () => {
  /*
   * The whole point of the flow: the old password stops working and the new one starts. Asserting
   * only the confirmation message would pass even if nothing had been written.
   */
  test('replaces the password everywhere, not just on screen', async ({ page }) => {
    const email = await registerAndLand(page);
    const next = 'a completely different passphrase';

    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill(next);
    await page.getByLabel('Confirm new password').fill(next);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText(/Password changed/)).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, email, password);
    await expect(page.getByRole('alert')).toBeVisible();

    await signIn(page, email, next);
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  });

  test('will not accept a wrong current password', async ({ page }) => {
    await registerAndLand(page);
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByLabel('Current password').fill('not the password');
    await page.getByLabel('New password', { exact: true }).fill('some new passphrase');
    await page.getByLabel('Confirm new password').fill('some new passphrase');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('will not accept a confirmation that does not match', async ({ page }) => {
    await registerAndLand(page);
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill('some new passphrase');
    await page.getByLabel('Confirm new password').fill('a different one entirely');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('signed-in devices', () => {
  test('lists this one, and names it something recognisable', async ({ page }) => {
    await registerAndLand(page);
    await expect(page.getByRole('region', { name: 'Security' })).toBeVisible();
    // The label is what somebody scans for a device that is not theirs.
    await expect(page.getByText(/Chrome on/)).toBeVisible();
  });

  test('renames a device, and the new name survives a reload', async ({ page }) => {
    await registerAndLand(page);
    await page
      .getByText(/Chrome on/)
      .first()
      .click();
    await page.getByRole('button', { name: 'Rename device' }).click();
    await page.getByRole('textbox').last().fill('My laptop');
    await page.getByRole('button', { name: 'Save name' }).click();

    await expect(page.getByText('My laptop')).toBeVisible();
    await page.reload();
    await expect(page.getByText('My laptop')).toBeVisible();
  });
});

test.describe('taking your data with you', () => {
  test('offers a copy and says when it is ready', async ({ page }) => {
    await registerAndLand(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download copy' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.json$/);
    await expect(page.getByRole('button', { name: 'Download started', exact: true })).toBeVisible();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 780 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const data = page.getByRole('region', { name: 'Your data', exact: true });
      await data.scrollIntoViewIfNeeded();
      await expect(data.getByRole('button')).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath(`account-download-${width}.png`),
        animations: 'disabled',
      });
    }
  });
});

test.describe('deleting the account', () => {
  test('refuses a wrong password, and deletes nothing', async ({ page }) => {
    const email = await registerAndLand(page);
    await page.getByRole('button', { name: 'Delete account' }).click();
    await page.getByLabel('Your password').fill('not the password');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    // Still there: a refused deletion must not have deleted anything.
    await page.reload();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  });

  /* An empty box never reaches the server: the field is required, so the browser stops the submit
     first. Worth pinning, because dropping `required` would send a blank password on a click. */
  test('will not submit at all with the box empty', async ({ page }) => {
    await registerAndLand(page);
    await page.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByLabel('Your password')).toHaveAttribute('required', '');
  });

  /* The one irreversible action on the page. Afterwards the credentials must not work. */
  test('with the password, really removes the account', async ({ page }) => {
    const email = await registerAndLand(page);
    await page.getByRole('button', { name: 'Delete account' }).click();
    await page.getByLabel('Your password').fill(password);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page).toHaveURL(/\/login|\/signup/);

    await signIn(page, email, password);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test('password-manager destination survives signing in', async ({ page }) => {
  const email = await registerAndLand(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/account?password=change', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login\?return_to=/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByLabel('Current password')).toBeFocused();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
});

test('tab titles follow authentication and recovery through browser history', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Sign in · aidenjang accounts');
  await expect(
    page.getByRole('link', { name: 'aiden jang', exact: true }),
  ).toHaveAccessibleDescription('Opens in a new tab');
  await page.getByRole('link', { name: /Forgot\?/i }).click();
  await expect(page).toHaveTitle('Reset password · aidenjang accounts');
  await page.goBack();
  await expect(page).toHaveTitle('Sign in · aidenjang accounts');
  await page.goForward();
  await expect(page).toHaveTitle('Reset password · aidenjang accounts');
  await page.goto('/privacy');
  await expect(page).toHaveTitle('Privacy · aidenjang accounts');
});
