import { expect, test, type Page } from './fixtures';
import { contrast, type Hex } from '../src/lib/theme';

const user = {
  id: 'ui-review',
  email: 'person@test.dev',
  displayName: 'Account Person',
  emailVerified: true,
  hasPassword: true,
  hasGoogle: true,
};

test('account save and delete buttons have readable text', async ({ page }) => {
  await account(page);
  const now = new Date().toISOString();
  await page.route('**/auth/sessions', (route) =>
    route.fulfill({
      json: {
        sessions: [
          {
            id: 'contrast-preview',
            current: true,
            device: 'Personal laptop',
            location: null,
            createdAt: now,
            lastSeenAt: now,
            expiresAt: '2099-01-01T00:00:00Z',
          },
        ],
      },
    }),
  );
  await page.goto('/account');
  await page.getByRole('button', { name: /Personal laptop/ }).click();
  await page.getByRole('button', { name: 'Rename device', exact: true }).click();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  for (const name of ['Save name', 'Delete my account']) {
    const colors = await page.getByRole('button', { name, exact: true }).evaluate((button) => {
      const style = getComputedStyle(button);
      return [style.color, style.backgroundColor];
    });
    const hex = colors.map((color) => {
      expect(color).toMatch(/^rgb\(/);
      return `#${color
        .match(/\d+/g)!
        .map((value) => Number(value).toString(16).padStart(2, '0'))
        .join('')}` as Hex;
    });
    expect(contrast(hex[0]!, hex[1]!), name).toBeGreaterThanOrEqual(4.5);
  }
});

async function account(page: Page, overrides = {}): Promise<void> {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { user: { ...user, ...overrides }, sudoUntil: null } }),
  );
  await page.route('**/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
}

async function passkeyAccount(page: Page): Promise<void> {
  // Management tests need the capability flag, not a hardware authenticator.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: class PublicKeyCredential {},
    });
  });
  await account(page);
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
  await passkeyAccount(page);
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
  await expect(section.getByText('No passkeys yet.', { exact: true })).toBeHidden();
  unavailable = false;
  await section.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(section.getByText('Personal laptop')).toBeVisible();
});

test('an account remains usable without browser passkey support', async ({ page }) => {
  await account(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined });
  });
  await page.goto('/account');
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Passkeys', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
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
  const prompt = page.getByRole('dialog');
  await expect(prompt.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
    'href',
    '/auth/google?return_to=%2Faccount%3Fpassword%3Dchange',
  );
  await expect(prompt.getByRole('link', { name: 'Reset by email' })).toBeVisible();
  await expect(page.getByText(/Password changed|Password set\./)).toBeHidden();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(
    'a fresh secure passphrase',
  );
  await expect(page.getByText(/Password changed|Password set\./)).toBeHidden();
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await prompt.getByRole('link', { name: 'Reset by email' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(user.email);
});

test('reauthentication keeps keyboard focus inside and restores it on cancellation', async ({
  page,
}) => {
  await passkeyAccount(page);
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

test('a pending reset keeps the address tied to the request', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/auth/forgot-password', async (route) => {
    await pending;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/forgot-password');
  const email = page.getByLabel('Email', { exact: true });
  await email.fill(user.email);
  const request = page.waitForRequest('**/auth/forgot-password');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  try {
    expect((await request).postDataJSON()).toMatchObject({ email: user.email });
    await expect(email).not.toBeEditable();
  } finally {
    finish();
  }
  const confirmation = page.getByRole('status');
  await expect(confirmation).toContainText(user.email);
  await expect(confirmation).toBeFocused();
});

test('leaving a pending sign-in keeps the visitor on password recovery', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/auth/login', async (route) => {
    await pending;
    await route.fulfill({ json: { user } }).catch(() => {});
  });
  await page.goto('/login');
  await page.evaluate(() => {
    const fetchRequest = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith('/auth/login')) {
        init?.signal?.addEventListener(
          'abort',
          () => {
            document.documentElement.dataset.loginCancelled = 'true';
          },
          { once: true },
        );
      }
      return fetchRequest(input, init);
    };
  });
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('test passphrase');
  const request = page.waitForRequest('**/auth/login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  try {
    await request;
    await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-login-cancelled', 'true');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  } finally {
    finish();
  }
});

test('verification resend reports delivery failure and reconciles an already verified address', async ({
  page,
}) => {
  await account(page, { emailVerified: false });
  let unavailable = true;
  await page.route('**/auth/resend-verification', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: 'EMAIL_UNAVAILABLE' } })
      : route.fulfill({ json: { ok: true, alreadyVerified: true } }),
  );
  await page.goto('/account');
  const resend = page.getByRole('button', { name: 'Resend verification email' });
  await resend.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Verification email sent', { exact: true })).toHaveCount(0);
  unavailable = false;
  await resend.click();
  await expect(page.getByText('verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Your email is already verified.', { exact: true })).toBeVisible();
  await expect(resend).toHaveCount(0);
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
  await passkeyAccount(page);
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
  await passkeyAccount(page);
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
  await expect(section.locator('time')).toHaveCount(1);
  await expect(section.locator('time')).toHaveAttribute('datetime', lastUsedAt);
  await expect(section.getByText('Backed up', { exact: true })).toBeVisible();
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
  await expect(fresh).toBeFocused();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
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

test('a passwordless deletion can return from Google to a fresh confirmation', async ({ page }) => {
  await account(page, { hasPassword: false });
  let attempts = 0;
  await page.route('**/auth/delete-account', (route) => {
    attempts += 1;
    return route.fulfill({
      status: 403,
      json: { error: 'REAUTH_REQUIRED', canUsePassword: false },
    });
  });
  await page.goto('/account');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Type your email to confirm').fill(user.email);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const prompt = page.getByRole('dialog');
  const returnTo = '/account?delete=confirm#delete-account';
  await expect(prompt.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
    'href',
    `/auth/google?return_to=${encodeURIComponent(returnTo)}`,
  );
  await expect(prompt.getByRole('link', { name: 'Reset by email' })).toHaveAttribute(
    'href',
    `/forgot-password?return_to=${encodeURIComponent(returnTo)}`,
  );
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByLabel('Type your email to confirm')).toHaveValue(user.email);
  await page.goto(returnTo);
  await expect(page.getByLabel('Type your email to confirm')).toHaveValue('');
  expect(attempts).toBe(1);
  await page
    .getByRole('region', { name: 'Danger zone' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page).toHaveURL(/\/account$/);
});

test('a profile save keeps its pending name visible and read-only', async ({ page }) => {
  await account(page);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/auth/update-profile', async (route) => {
    await pending;
    await route.fulfill({ json: { user: { ...user, displayName: 'Updated name' } } });
  });
  await page.goto('/account');
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  await profile.getByRole('button', { name: 'Edit', exact: true }).click();
  const name = profile.getByRole('textbox', { name: 'Display name' });
  await name.fill('Updated name');
  await profile.getByRole('button', { name: 'Save', exact: true }).click();
  try {
    await expect(name).toHaveValue('Updated name');
    await expect(name).not.toBeEditable();
  } finally {
    finish();
  }
  await expect(profile.getByText('Updated name', { exact: true })).toBeVisible();
});

test('security review shows a failed sign-out beside its retry action', async ({ page }) => {
  await account(page, { hasPassword: false });
  let attempts = 0;
  await page.route('**/auth/sessions/revoke-others', (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } })
      : route.fulfill({ json: { ok: true } }),
  );
  await page.goto('/account?security=review');
  const review = page.getByRole('region', { name: 'Was that sign-in you?' });
  const retry = review.getByRole('button', { name: 'That was not me' });
  await retry.click();
  await expect(review.getByRole('alert')).toContainText('Couldn’t sign out the other devices.');
  await retry.click();
  await expect(page.getByRole('heading', { name: 'Other devices are signed out' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('sign-out in another tab clears the account view without a reload', async ({
  page,
  context,
}) => {
  await account(page);
  let signedIn = true;
  await page.route('**/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { user } })
      : route.fulfill({ status: 401, json: { error: 'UNAUTHENTICATED' } }),
  );
  await page.goto('/account');
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  const otherTab = await context.newPage();
  await otherTab.route('**/auth/logout', (route) => {
    signedIn = false;
    return route.fulfill({ json: { ok: true } });
  });
  await otherTab.goto('/logout');
  await expect(otherTab).toHaveURL(/\/login$/);
  await expect(page).toHaveURL(/\/login\?return_to=/);
});

async function observeCancellation(page: Page, path: string): Promise<void> {
  await page.evaluate((requestPath) => {
    const fetchRequest = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith(requestPath)) {
        init?.signal?.addEventListener(
          'abort',
          () => {
            document.documentElement.dataset.requestCancelled = 'true';
          },
          { once: true },
        );
      }
      return fetchRequest(input, init);
    };
  }, path);
}

test('leaving sign-up cancels its pending navigation', async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/auth/register', async (route) => {
    await pending;
    await route.fulfill({ status: 201, json: { user } }).catch(() => {});
  });
  await page.goto('/signup');
  await observeCancellation(page, '/auth/register');
  await page.getByLabel('Name', { exact: true }).fill(user.displayName);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Confirm email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('test passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('test passphrase');
  const request = page.waitForRequest('**/auth/register');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  try {
    await request;
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-request-cancelled', 'true');
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    finish();
  }
});

test('leaving passkey sign-in cancels its pending navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aidenjang:passkey-on-this-device', '1');
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: class {
        static async isUserVerifyingPlatformAuthenticatorAvailable() {
          return true;
        }
        static async isConditionalMediationAvailable() {
          return false;
        }
      },
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: async () => {
          const bytes = new Uint8Array([1, 2, 3]).buffer;
          return {
            id: 'fixture',
            rawId: bytes,
            type: 'public-key',
            response: { authenticatorData: bytes, clientDataJSON: bytes, signature: bytes },
            getClientExtensionResults: () => ({}),
          };
        },
      },
    });
  });
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/auth/passkeys/login/options', (route) =>
    route.fulfill({ json: { options: { challenge: 'AQID', allowCredentials: [] } } }),
  );
  await page.route('**/auth/passkeys/login/verify', async (route) => {
    await pending;
    await route.fulfill({ json: { user, usedPasskey: 'fixture' } }).catch(() => {});
  });
  await page.goto('/login');
  await observeCancellation(page, '/auth/passkeys/login/verify');
  const request = page.waitForRequest('**/auth/passkeys/login/verify');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  try {
    await request;
    await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-request-cancelled', 'true');
    await expect(page).toHaveURL(/\/forgot-password$/);
  } finally {
    finish();
  }
});
