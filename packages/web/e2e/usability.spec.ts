import { mkdir } from 'node:fs/promises';
import { test, expect, type Page } from './fixtures';

const user = {
  id: 'ux-review',
  displayName: 'Account Person',
  email: 'person@example.test',
  emailVerified: true,
  hasPassword: true,
  hasGoogle: true,
};
async function account(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/auth/me', (route) => route.fulfill({ json: { user, sudoUntil: null } }));
  await page.route('**/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
}
async function capture(page: Page, name: string) {
  if (!process.env.ACCOUNTS_UX_CAPTURE) return;
  await mkdir(process.env.ACCOUNTS_UX_CAPTURE, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${process.env.ACCOUNTS_UX_CAPTURE}/${name}-${test.info().project.name}.png`,
    animations: 'disabled',
  });
}

test('profile editing uses the phone width and returns focus after cancel or save', async ({
  page,
}) => {
  await account(page);
  let saved = { ...user };
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { user: saved, sudoUntil: null } }),
  );
  await page.route('**/auth/update-profile', (route) => {
    saved = { ...saved, displayName: route.request().postDataJSON().displayName };
    return route.fulfill({ json: { user: saved } });
  });
  await page.goto('/account');
  await capture(page, 'account');
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  const edit = profile.getByRole('button', { name: 'Edit', exact: true });
  await edit.click();
  const field = profile.getByRole('textbox', { name: 'Display name' });
  await expect(field).toBeFocused();
  const viewport = page.viewportSize()!;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect((await field.boundingBox())!.width).toBeGreaterThan(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await capture(page, `profile-edit-${width}`);
  }
  await page.setViewportSize(viewport);
  await field.fill('Unfinished name');
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(field).toHaveValue('Account Person');
  await field.fill('Saved name');
  await profile.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(profile).toContainText('Saved name');
  await expect(edit).toBeFocused();
  await page.reload();
  await expect(profile).toContainText('Saved name');
});

test('closing a password deep link keeps it closed after refresh and returns to its trigger', async ({
  page,
}) => {
  await account(page);
  await page.goto('/account?password=change');
  await expect(page.getByLabel('Current password', { exact: true })).toBeFocused();
  await capture(page, 'password-edit');
  await page
    .getByRole('region', { name: 'Security', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page).not.toHaveURL(/password=change/);
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0);
});

test('a device rename stays visible while saving and returns to its saved row', async ({
  page,
}) => {
  await account(page);
  let device = 'Personal laptop';
  const now = new Date().toISOString();
  await page.route('**/auth/sessions', (route) =>
    route.fulfill({
      json: {
        sessions: [
          {
            id: 'current',
            current: true,
            device,
            location: 'New York',
            createdAt: now,
            lastSeenAt: now,
            expiresAt: '2099-01-01T00:00:00Z',
          },
        ],
      },
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/auth/sessions/rename', async (route) => {
    await gate;
    device = route.request().postDataJSON().label;
    await route.fulfill({ json: { session: { id: 'current', device } } });
  });
  await page.goto('/account');
  const sessions = page.getByRole('region', { name: 'Active sessions', exact: true });
  await sessions.getByRole('button', { name: /Personal laptop/ }).click();
  const rename = sessions.getByRole('button', { name: 'Rename device', exact: true });
  await rename.click();
  await sessions.getByLabel('Device name').fill('Travel laptop');
  await sessions.getByRole('button', { name: 'Save name' }).click();
  try {
    await expect(sessions.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(sessions.getByRole('button', { name: /Personal laptop/ })).toBeDisabled();
  } finally {
    release();
  }
  await expect(sessions).toContainText('Travel laptop');
  await expect(rename).toBeFocused();
  await capture(page, 'device-details');
  await page.reload();
  await expect(sessions).toContainText('Travel laptop');
});

test('deletion focuses confirmation and never offers a false cancellation during a request', async ({
  page,
}) => {
  await account(page);
  await page.goto('/account');
  const danger = page.getByRole('region', { name: 'Danger zone', exact: true });
  const open = danger.getByRole('button', { name: 'Delete account', exact: true });
  await open.click();
  await expect(page.getByLabel('Your password', { exact: true })).toBeFocused();
  await danger.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(open).toBeFocused();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/auth/delete-account', async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: { error: 'UNAVAILABLE', message: 'Try again shortly.' },
    });
  });
  await open.click();
  await page.getByLabel('Your password', { exact: true }).fill('a synthetic password');
  await danger.getByRole('button', { name: 'Delete my account', exact: true }).click();
  try {
    await expect(danger.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(danger.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Your password', { exact: true })).toHaveValue(
    'a synthetic password',
  );
});

test('sign-in and recovery pages keep clear labels and readable narrow layouts', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    if (path === '/forgot-password')
      await expect(page.locator('label[for="reset-email"]')).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await capture(page, `${path.slice(1)}-${width}`);
    }
  }
});
