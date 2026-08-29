import { securityEvents } from './db/schema.js';
import type { DB } from './db/client.js';
import type { SessionMeta } from './auth/session.js';

export type SecurityEventType =
  | 'account_created'
  | 'signed_in'
  | 'email_verified'
  | 'password_added'
  | 'password_changed'
  | 'password_reset'
  | 'google_connected'
  | 'google_disconnected'
  | 'device_renamed'
  | 'device_signed_out'
  | 'other_devices_signed_out'
  | 'passkey_added'
  | 'passkey_removed';

export type SignInMethod = 'password' | 'google' | 'passkey';

export async function recordSecurityEvent(
  db: DB,
  userId: string,
  type: SecurityEventType,
  meta?: SessionMeta,
  method?: SignInMethod,
): Promise<void> {
  await db.insert(securityEvents).values({
    id: crypto.randomUUID(),
    userId,
    type,
    method: method ?? null,
    device: meta?.device ?? null,
    location: meta?.location ?? null,
  });
}
