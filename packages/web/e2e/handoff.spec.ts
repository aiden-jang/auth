import { expect, test } from './fixtures';
import { linkEmailedTo } from './mail';

const destination = 'https://owewell.aidenjang.com/g/handoff?tab=activity';
const password = 'correct horse battery staple';

test('email verification keeps the app destination and offers an explicit return', async ({
  page,
}) => {
  const email = `handoff-verify-${Date.now()}@test.dev`;
  const response = await page.request.post('/auth/register', {
    data: { email, password, displayName: 'Handoff', returnTo: destination },
  });
  expect(response.status()).toBe(201);
  const link = await linkEmailedTo(email, '/verify-email');
  expect(new URL(link).searchParams.get('return_to')).toBe(destination);
  await page.goto(link);
  await expect(page.getByText('Your email is verified. Nothing else to do.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to owewell' })).toHaveAttribute(
    'href',
    destination,
  );
});

test('password recovery carries the destination from email through sign-in', async ({ page }) => {
  const email = `handoff-reset-${Date.now()}@test.dev`;
  const response = await page.request.post('/auth/register', {
    data: { email, password, displayName: 'Handoff' },
  });
  expect(response.status()).toBe(201);
  await page.request.post('/auth/logout');
  await page.goto(`/forgot-password?return_to=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('check that inbox')).toBeVisible();
  const link = await linkEmailedTo(email, '/reset-password');
  expect(new URL(link).searchParams.get('return_to')).toBe(destination);
  await page.goto(link);
  const next = 'a new handoff password';
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('return_to')).toBe(destination);
  await page.route(destination, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Returned to the bill</h1>' }),
  );
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Returned to the bill' })).toBeVisible();
  expect(page.url()).toBe(destination);
});
