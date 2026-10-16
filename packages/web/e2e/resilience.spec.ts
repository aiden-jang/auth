import { expect, test, type Page } from './fixtures';

const user = {
  id: 'ui-review',
  email: 'person@test.dev',
  displayName: 'Account Person',
  emailVerified: true,
  hasPassword: true,
  hasGoogle: true,
};

async function account(page: Page, overrides = {}): Promise<void> {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { user: { ...user, ...overrides }, sudoUntil: null } }),
  );
  await page.route('**/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
}

test('an account outage stays recoverable without pretending the session expired', async ({
  page,
}) => {
  await account(page);
  let unavailable = true;
  await page.route('**/auth/me', (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { error: 'UNAVAILABLE' } }
        : { json: { user, sudoUntil: null } },
    ),
  );
  await page.goto('/account');
  await expect(page.getByRole('alert')).toContainText(/unavailable|reach|load/i);
  await expect(page).toHaveURL(/\/account$/);
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
});

test('logout waits for confirmation and offers a retry on failure', async ({ page }) => {
  let unavailable = true;
  await page.route('**/auth/logout', (route) =>
    route.fulfill(
      unavailable ? { status: 503, json: { error: 'UNAVAILABLE' } } : { json: { ok: true } },
    ),
  );
  await page.goto('/logout');
  await expect(page.getByRole('alert')).toContainText(/sign.*out|unavailable/i);
  await expect(page).toHaveURL(/\/logout$/);
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a failed passkey list is an error with a retry, never an empty account', async ({ page }) => {
  await account(page);
  let unavailable = true;
  await page.route('**/auth/passkeys', (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { error: 'UNAVAILABLE' } }
        : {
            json: {
              passkeys: [
                {
                  id: 'key-1',
                  label: 'Personal laptop',
                  backedUp: true,
                  createdAt: new Date().toISOString(),
                  lastUsedAt: null,
                },
              ],
            },
          },
    ),
  );
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'Passkeys', exact: true });
  await expect(section.getByRole('alert')).toBeVisible();
  await expect(section.getByText('None yet.', { exact: false })).toBeHidden();
  unavailable = false;
  await section.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(section.getByText('Personal laptop')).toBeVisible();
});

test('cancelling reauthentication keeps the password draft without claiming success', async ({
  page,
}) => {
  await account(page, { hasPassword: false });
  await page.route('**/auth/set-password', (route) =>
    route.fulfill({ status: 403, json: { error: 'REAUTH_REQUIRED', canUsePassword: false } }),
  );
  await page.goto('/account');
  await page.getByRole('button', { name: 'Set a password', exact: true }).click();
  await page.getByLabel('New password', { exact: true }).fill('a fresh secure passphrase');
  await page.getByLabel('Confirm new password').fill('a fresh secure passphrase');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Password changed|Password set\./)).toBeHidden();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(
    'a fresh secure passphrase',
  );
  await expect(page.getByText(/Password changed|Password set\./)).toBeHidden();
});

test('reauthentication keeps keyboard focus inside and restores it on cancellation', async ({
  page,
}) => {
  await account(page);
  await page.route('**/auth/passkeys', (route) =>
    route.fulfill({
      json: {
        passkeys: [
          {
            id: 'key-1',
            label: 'Personal laptop',
            backedUp: true,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
          },
        ],
      },
    }),
  );
  await page.route('**/auth/passkeys/delete', (route) =>
    route.fulfill({ status: 403, json: { error: 'REAUTH_REQUIRED', canUsePassword: true } }),
  );
  await page.goto('/account');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.getByLabel('Your password', { exact: true }).fill('a valid passphrase');
  await page.getByRole('button', { name: 'Confirm', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Your password', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeFocused();
});

test('a verification service outage offers retry without declaring the link invalid', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/auth/verify-email', (route) =>
    route.fulfill(
      ++calls === 1 ? { status: 503, json: { error: 'UNAVAILABLE' } } : { json: { ok: true } },
    ),
  );
  await page.goto('/verify-email?token=review-token');
  await expect(page.getByRole('alert')).toContainText(/unavailable|reach|verify/i);
  await expect(page.getByText('That verification link is invalid or expired.')).toBeHidden();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Your email is verified. Nothing else to do.')).toBeVisible();
  expect(calls).toBe(2);
});

test('a reset-request outage preserves the email and does not promise a sent link', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/auth/forgot-password', (route) =>
    route.fulfill(
      unavailable ? { status: 503, json: { error: 'UNAVAILABLE' } } : { json: { ok: true } },
    ),
  );
  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill('person@test.dev');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('check that inbox', { exact: false })).toBeHidden();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('person@test.dev');
  unavailable = false;
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByText('check that inbox', { exact: false })).toBeVisible();
});

test('a device-list failure does not claim there are no active sessions', async ({ page }) => {
  await account(page);
  await page.route('**/auth/sessions', (route) =>
    route.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } }),
  );
  await page.goto('/account');
  await expect(page.getByText('Couldn’t refresh active devices. Try again.')).toBeVisible();
  await expect(page.getByText('No active sessions.', { exact: true })).toBeHidden();
  await expect(page.getByText('Reading your devices.', { exact: false })).toBeHidden();
});

test('a post-confirmation action failure returns to the original error handler', async ({
  page,
}) => {
  await account(page);
  await page.route('**/auth/passkeys', (route) =>
    route.fulfill({
      json: {
        passkeys: [
          {
            id: 'key-1',
            label: 'Personal laptop',
            backedUp: true,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
          },
        ],
      },
    }),
  );
  let attempts = 0;
  await page.route('**/auth/passkeys/delete', (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 403, json: { error: 'REAUTH_REQUIRED', canUsePassword: true } }
        : {
            status: 500,
            json: { error: 'UNAVAILABLE', message: 'Could not remove this passkey. Try again.' },
          },
    ),
  );
  await page.route('**/auth/reauth', (route) =>
    route.fulfill({ json: { ok: true, sudoUntil: null } }),
  );
  await page.goto('/account');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByLabel('Your password', { exact: true }).fill('a valid passphrase');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Could not remove this passkey. Try again.')).toBeVisible();
  await expect(page.getByText('Personal laptop')).toBeVisible();
  expect(attempts).toBe(2);
});

test('passkey details stay readable with long names and forced colors', async ({ page }) => {
  await account(page);
  const label = 'Personal laptop — 수진 — ' + 'Travel authenticator '.repeat(10);
  const lastUsedAt = '2026-10-15T13:14:00.000Z';
  await page.route('**/auth/passkeys', (route) =>
    route.fulfill({
      json: {
        passkeys: [
          {
            id: 'review-key',
            label,
            backedUp: true,
            createdAt: '2026-10-01T12:00:00.000Z',
            lastUsedAt,
          },
        ],
      },
    }),
  );
  await page.goto('/account');
  const section = page.getByRole('region', { name: 'Passkeys', exact: true });
  const name = section.getByText(label, { exact: true });
  await expect(name).toBeVisible();
  const exact = await page.evaluate(
    (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    lastUsedAt,
  );
  await expect(section.getByText(`Last used: ${exact}`, { exact: true })).toBeVisible();
  await expect(section.locator('time')).toHaveAttribute('datetime', lastUsedAt);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await section.scrollIntoViewIfNeeded();
    expect(await name.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe('ellipsis');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const forcedColors of ['none', 'active'] as const) {
      await page.emulateMedia({ forcedColors });
      await section.getByRole('button', { name: 'Add a passkey', exact: true }).focus();
      await page.screenshot({
        path: test.info().outputPath(`details2-passkeys-${width}-${forcedColors}.png`),
        animations: 'disabled',
      });
    }
  }
});

test('an expired password reset offers a fresh link while service failures preserve the form', async ({
  page,
}) => {
  const returnTo = 'https://worth.aidenjang.com/lists';
  let attempts = 0;
  await page.route('**/auth/reset-password', (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 503, json: { error: 'UNAVAILABLE', message: 'Try again shortly.' } }
        : {
            status: 400,
            json: { error: 'INVALID_TOKEN', message: 'That reset link is invalid or expired.' },
          },
    ),
  );
  await page.goto(`/reset-password?token=expired&return_to=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('New password', { exact: true }).fill('a fresh passphrase');
  await page.getByLabel('Confirm new password', { exact: true }).fill('a fresh passphrase');
  const submit = page.getByRole('button', { name: 'Set new password', exact: true });
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Try again shortly.');
  await expect(
    page.getByRole('link', { name: 'Request a new reset link', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('a fresh passphrase');
  await submit.click();
  const fresh = page.getByRole('link', { name: 'Request a new reset link', exact: true });
  await expect(fresh).toBeVisible();
  await expect(submit).toHaveCount(0);
  await expect(fresh).toHaveAttribute(
    'href',
    `/forgot-password?return_to=${encodeURIComponent(returnTo)}`,
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await fresh.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`reset-recovery-${width}.png`),
      animations: 'disabled',
    });
  }
  await fresh.click();
  await expect(page.getByRole('button', { name: 'Send reset link', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email');
});
