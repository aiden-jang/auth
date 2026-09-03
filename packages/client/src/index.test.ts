import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getSessionUser,
  loginUrl,
  logoutUrl,
  signupUrl,
  siteFooterLinks,
  SITE_AUTHOR_URL,
} from './index.js';

const ACCOUNTS = 'https://accounts.aidenjang.com';

describe('auth-client URLs', () => {
  test('loginUrl carries an encoded return_to', () => {
    expect(loginUrl(ACCOUNTS, 'https://owewell.aidenjang.com/groups')).toBe(
      'https://accounts.aidenjang.com/login?return_to=https%3A%2F%2Fowewell.aidenjang.com%2Fgroups',
    );
  });

  test('signupUrl points at /signup with return_to (distinct from login)', () => {
    expect(signupUrl(ACCOUNTS, 'https://owewell.aidenjang.com/groups')).toBe(
      'https://accounts.aidenjang.com/signup?return_to=https%3A%2F%2Fowewell.aidenjang.com%2Fgroups',
    );
  });

  test('logoutUrl points at /logout with return_to', () => {
    expect(logoutUrl(ACCOUNTS, 'https://owewell.aidenjang.com')).toBe(
      'https://accounts.aidenjang.com/logout?return_to=https%3A%2F%2Fowewell.aidenjang.com',
    );
  });

  /*
   * A return_to with its own query is the normal case, not an edge one: apps send people to
   * /groups?invite=abc. Encoding the whole thing as one parameter is what stops `&invite=abc`
   * from arriving at the login page as a second parameter of its own.
   */
  test('a return_to carrying its own query and hash survives as one parameter', () => {
    const back = 'https://owewell.aidenjang.com/g?invite=abc&ref=sms#split';
    const parsed = new URL(loginUrl(ACCOUNTS, back));
    expect(parsed.searchParams.get('return_to')).toBe(back);
    expect([...parsed.searchParams.keys()]).toEqual(['return_to']);
  });
});

describe('the shared footer', () => {
  test('credits the author off-site and keeps the legal pages on the account app', () => {
    expect(siteFooterLinks(ACCOUNTS)).toEqual([
      { label: 'made by aiden jang', href: SITE_AUTHOR_URL, external: true },
      { label: 'privacy', href: 'https://accounts.aidenjang.com/privacy' },
      { label: 'terms', href: 'https://accounts.aidenjang.com/terms' },
    ]);
  });

  // Only the off-site link is external: apps render that one with rel=noreferrer.
  test('marks exactly the off-site link external', () => {
    const external = siteFooterLinks(ACCOUNTS).filter((l) => l.external);
    expect(external.map((l) => l.label)).toEqual(['made by aiden jang']);
  });

  test('follows the base url so a dev build points at its local account app', () => {
    expect(siteFooterLinks('http://localhost:8787').map((l) => l.href)).toEqual([
      SITE_AUTHOR_URL,
      'http://localhost:8787/privacy',
      'http://localhost:8787/terms',
    ]);
  });
});

function request(cookie?: string): Request {
  return new Request(
    'https://owewell.aidenjang.com/api/groups',
    cookie ? { headers: { cookie } } : undefined,
  );
}

/** Record every fetch the client makes, and reply with whatever the test asks for. */
function stubFetch(reply: () => Response): { calls: { url: string; cookie: string | null }[] } {
  const calls: { url: string; cookie: string | null }[] = [];
  vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), cookie: headers.get('cookie') });
    return reply();
  });
  return { calls };
}

const ME = { id: 'u_1', email: 'a@b.com', displayName: 'Aiden', emailVerified: true };

afterEach(() => vi.unstubAllGlobals());

describe('resolving the session', () => {
  test('returns the user the account service vouches for', async () => {
    stubFetch(() => Response.json({ user: ME, sudoUntil: null }));
    expect(await getSessionUser(request('platform_session=tok'), ACCOUNTS)).toEqual(ME);
  });

  test('asks the account service, forwarding the cookie unchanged', async () => {
    const { calls } = stubFetch(() => Response.json({ user: ME }));
    await getSessionUser(request('platform_session=tok; other=x'), ACCOUNTS);
    expect(calls).toEqual([
      { url: 'https://accounts.aidenjang.com/auth/me', cookie: 'platform_session=tok; other=x' },
    ]);
  });

  /* No cookie cannot be a session, so spending a subrequest on it would be pure latency. */
  test('answers a cookieless request without calling out at all', async () => {
    const { calls } = stubFetch(() => Response.json({ user: ME }));
    expect(await getSessionUser(request(), ACCOUNTS)).toBeNull();
    expect(calls).toEqual([]);
  });

  test('reports a rejected session as signed out', async () => {
    stubFetch(() => Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }));
    expect(await getSessionUser(request('platform_session=stale'), ACCOUNTS)).toBeNull();
  });

  /*
   * The status decides, never the body. Bodies on a refusal are not trustworthy input: a cached
   * error page or an edge that echoes the request could carry anything, and reading a user out of
   * one would sign somebody in on a response that said no.
   */
  test.each([401, 403, 500, 503])('does not read a user out of a %i', async (status) => {
    stubFetch(() => Response.json({ user: ME }, { status }));
    expect(await getSessionUser(request('platform_session=tok'), ACCOUNTS)).toBeNull();
  });

  /*
   * /auth/me answers 200 with no user on paths that have a session but no account behind it.
   * Reading `user` off that must not hand back undefined as though it were a person.
   */
  test('reports a 200 with no user as signed out', async () => {
    stubFetch(() => Response.json({ sudoUntil: null }));
    expect(await getSessionUser(request('platform_session=tok'), ACCOUNTS)).toBeNull();
  });

  /*
   * The wire carries hasPassword and hasGoogle too, which the account page needs and nobody else
   * does. Apps must keep working when /auth/me grows a field, so this is a floor, not an equality.
   */
  test('ignores fields it does not model, so the service can grow', async () => {
    stubFetch(() => Response.json({ user: { ...ME, hasPassword: true, hasGoogle: false } }));
    const user = await getSessionUser(request('platform_session=tok'), ACCOUNTS);
    expect(user).toMatchObject(ME);
  });

  // Absolute, so a base url with a path still resolves to the service root.
  test('always hits /auth/me at the origin, whatever path the base url carries', async () => {
    const { calls } = stubFetch(() => Response.json({ user: ME }));
    await getSessionUser(request('platform_session=tok'), 'https://accounts.aidenjang.com/api/v2');
    expect(calls[0]?.url).toBe('https://accounts.aidenjang.com/auth/me');
  });
});
