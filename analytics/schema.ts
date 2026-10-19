// Shared browser/Worker contract. Dynamic path segments never enter an event.
export const APP = 'auth';
export const HOST = 'accounts.aidenjang.com';
export const PAGES = [
  'account',
  'forgot_password',
  'login',
  'logout',
  'other',
  'privacy',
  'reset_password',
  'signup',
  'terms',
  'verify_email',
] as const;
export const ACTIONS = [] as const;
export type Page = (typeof PAGES)[number];
export type AnalyticsEvent = { name: 'page_view'; page: Page } | { name: (typeof ACTIONS)[number] };
const exact: Record<string, Page> = {
  '/login': 'login',
  '/signup': 'signup',
  '/forgot-password': 'forgot_password',
  '/reset-password': 'reset_password',
  '/verify-email': 'verify_email',
  '/logout': 'logout',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/': 'account',
  '/account': 'account',
};
const prefixes: readonly (readonly [string, Page])[] = [];
export function pageForPath(pathname: string): Page {
  const rawPath = pathname.split(/[?#]/)[0] ?? '';
  const path = rawPath === '/' ? '/' : rawPath.replace(/\/+$/, '');
  if (Object.prototype.hasOwnProperty.call(exact, path)) return exact[path]!;
  return prefixes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'other';
}
export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (event.name === 'page_view')
    return (
      keys.length === 2 &&
      keys.includes('page') &&
      typeof event.page === 'string' &&
      (PAGES as readonly string[]).includes(event.page)
    );
  return (
    keys.length === 1 &&
    typeof event.name === 'string' &&
    (ACTIONS as readonly string[]).includes(event.name)
  );
}

// Confirmed server operations cannot be fabricated through the anonymous browser endpoint.
export const BROWSER_ACTIONS: readonly string[] = ACTIONS;
export function isBrowserAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isAnalyticsEvent(value)) return false;
  const name = value.name;
  return name === 'page_view' || BROWSER_ACTIONS.includes(name);
}
