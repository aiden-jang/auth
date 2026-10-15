import type { Env } from '../env.js';

export function authOrigins(env: Env, requestUrl: string): Set<string> {
  const origins = new Set([new URL(requestUrl).origin]);
  if (env.APP_URL && URL.canParse(env.APP_URL)) origins.add(new URL(env.APP_URL).origin);
  for (const origin of env.CORS_ORIGINS?.split(',') ?? []) {
    if (origin.trim()) origins.add(origin.trim());
  }
  return origins;
}
