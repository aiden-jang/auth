import { expect, test } from '@playwright/test';

/*
 * The shape /auth/me answers with, checked against what @aidenjang/auth-client reads out of it.
 *
 * Six apps resolve identity through that package, and none of them are in this repo. A rename here
 * type-checks, passes every test in this repo, deploys, and breaks all six at once -- so the field
 * names are asserted literally rather than through a type that would be changed in the same commit.
 */

const AUTH = 'http://localhost:34100';
const password = 'correct horse battery staple';

test('an unauthenticated caller is refused, not guessed at', async ({ request }) => {
  const res = await request.get(`${AUTH}/auth/me`, { headers: {} });
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'UNAUTHENTICATED' });
});

test('a rubbish cookie is refused the same way, revealing nothing extra', async ({ request }) => {
  const res = await request.get(`${AUTH}/auth/me`, {
    headers: { cookie: 'platform_session=not-a-real-token' },
  });
  expect(res.status()).toBe(401);
});

test('/auth/me answers with the fields every app reads', async ({ request }) => {
  const email = `contract-${Date.now()}@test.dev`;
  const registered = await request.post(`${AUTH}/auth/register`, {
    data: { email, password, displayName: 'Contract Person' },
  });
  expect(registered.status()).toBe(201);

  const cookie = (registered.headersArray() ?? [])
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => /(platform_session=[^;]+)/.exec(h.value)?.[1])
    .find(Boolean);
  expect(cookie, 'registering did not set a session cookie').toBeTruthy();

  const res = await request.get(`${AUTH}/auth/me`, { headers: { cookie: cookie! } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { user: Record<string, unknown> };

  // The four the published client declares on AuthUser. Renaming any one breaks every app.
  expect(body.user).toMatchObject({
    id: expect.any(String),
    email,
    displayName: 'Contract Person',
    emailVerified: false,
  });

  // The account page needs these two; other apps ignore them. Here so dropping one is a decision.
  expect(body.user).toMatchObject({
    hasPassword: expect.any(Boolean),
    hasGoogle: expect.any(Boolean),
  });

  // The envelope matters as much as the fields: the client reads `data.user`, not the root.
  expect(Object.keys(body)).toContain('user');
});

/*
 * The session cookie is the credential. If it ever loses HttpOnly or Secure, or widens past Lax,
 * a bug in any one app on the platform becomes a way to take the cookie for all of them.
 */
test('the session cookie is set with the flags the platform depends on', async ({ request }) => {
  const res = await request.post(`${AUTH}/auth/register`, {
    data: { email: `flags-${Date.now()}@test.dev`, password, displayName: 'Flags' },
  });
  const setCookie = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .find((v) => v.startsWith('platform_session='));

  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Lax');
  expect(setCookie).toContain('Path=/');
});
