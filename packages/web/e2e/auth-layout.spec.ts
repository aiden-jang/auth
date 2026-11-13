import { expect, test } from './fixtures';

test('remembered accounts lead to sign-in methods without losing a refused password draft', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'aidenjang:recent-accounts:v1',
      JSON.stringify([
        { email: 'alex@example.test', lastUsedAt: new Date().toISOString() },
        { email: 'sam@example.test', lastUsedAt: new Date().toISOString() },
      ]),
    ),
  );
  let submitted: unknown;
  await page.route('**/auth/login', (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      status: 503,
      json: { error: 'UNAVAILABLE', message: 'Try again shortly.' },
    });
  });
  await page.goto('/login?return_to=https%3A%2F%2Fbloomnote.aidenjang.com%2Fmine');
  await expect(
    page.getByRole('heading', { name: 'Choose your account', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /al•••@example\.test/ }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeFocused();
  await page.getByText('Use your password', { exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('alex@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a synthetic password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Try again shortly.');
  expect(submitted).toMatchObject({ email: 'alex@example.test', password: 'a synthetic password' });
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('a synthetic password');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose your account', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Forget alex@example.test on this device', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /al•••@example\.test/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use another account', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the destination is visible while unfamiliar return links keep the shared identity', async ({
  page,
}) => {
  await page.goto('/login?return_to=https%3A%2F%2Fbloomnote.aidenjang.com%2Fmine');
  await expect(
    page.getByRole('heading', { name: 'Continue to bloomnote', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Continue with Google', exact: true }),
  ).toHaveAttribute('href', /return_to=https%3A%2F%2Fbloomnote\.aidenjang\.com%2Fmine/);
  await page.goto('/login?return_to=https%3A%2F%2Fevil.example%2F');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.auth-destination')).toHaveCount(0);
});

test('account navigation preserves drafts, browser history, and the selected section on reload', async ({
  page,
}) => {
  const user = {
    id: 'navigation-fixture',
    displayName: 'Alex',
    email: 'alex@example.test',
    emailVerified: true,
    hasPassword: true,
    hasGoogle: true,
  };
  await page.route('**/auth/me', (route) => route.fulfill({ json: { user, sudoUntil: null } }));
  await page.route('**/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
  await page.goto('/account');
  const navigation = page.getByRole('navigation', { name: 'Account sections' });
  await expect(page.getByRole('heading', { name: 'Your apps', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Profile', exact: true }).click();
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  await profile.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Display name').fill('Unfinished name');
  await navigation.getByRole('link', { name: 'Devices', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Devices', exact: true })).toBeFocused();
  await expect(page.getByLabel('Display name')).toBeHidden();
  await page.goBack();
  await expect(page.getByLabel('Display name')).toHaveValue('Unfinished name');
  await expect(navigation.getByRole('link', { name: 'Profile', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('link', { name: 'Data', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your data', level: 1, exact: true }),
  ).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Data', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('region', { name: 'Apps', exact: true })).toBeHidden();
});

test('account callbacks and legacy links reveal their feedback and confirmation forms', async ({
  page,
}) => {
  const user = {
    id: 'callback-fixture',
    displayName: 'Alex',
    email: 'alex@example.test',
    emailVerified: true,
    hasPassword: false,
    hasGoogle: true,
  };
  await page.route('**/auth/me', (route) => route.fulfill({ json: { user, sudoUntil: null } }));
  await page.route('**/auth/sessions', (route) => route.fulfill({ json: { sessions: [] } }));
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
  const navigation = page.getByRole('navigation', { name: 'Account sections' });
  await page.goto('/account?error=google_failed&reason=google_already_linked');
  await expect(
    page.getByText('That Google account is already linked to a different account.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Sign-in', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page).not.toHaveURL(/error=|reason=/);
  await page.reload();
  await expect(navigation.getByRole('link', { name: 'Sign-in', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goto('/account#security');
  await expect(page.getByRole('heading', { name: 'How you sign in', level: 1 })).toBeVisible();
  await page.goto('/account?delete=confirm#delete-account');
  await expect(page.getByLabel('Type your email to confirm')).toBeFocused();
  await expect(navigation.getByRole('link', { name: 'Data', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page
    .getByRole('region', { name: 'Danger zone', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page).not.toHaveURL(/delete=confirm/);
  await page.reload();
  await expect(navigation.getByRole('link', { name: 'Data', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByLabel('Type your email to confirm')).toHaveCount(0);
});
