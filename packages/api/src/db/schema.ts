import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Shared identity: one account per person across every app. App-specific data
// (owewell's placeholder members, etc.) lives in each app's own D1, not here.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  // Stored already lowercased + trimmed by the app layer.
  email: text('email').notNull().unique(),
  // Null for accounts created via an OAuth provider (Google), which have no password.
  passwordHash: text('password_hash'),
  // Google account id (the OIDC `sub`), when the user linked/created via Google.
  googleId: text('google_id').unique(),
  displayName: text('display_name').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// One-time tokens for password reset and email verification. `id` = SHA-256 of the raw
// token (raw token only in the emailed link); `purpose` is 'reset' or 'verify'.
export const authTokens = sqliteTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// `id` holds the SHA-256 hash of the session token; the raw token lives only in the
// user's cookie, so a DB leak never hands out live sessions.
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  // Session metadata for the "active devices" list. Parsed device label (not the raw UA) and a
  // coarse city/country from Cloudflare's edge (not the raw IP); nullable for pre-existing rows.
  device: text('device'),
  location: text('location'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  // When this session last proved who it belongs to, which is not the same as when it was created:
  // signing in stamps it, and so does re-entering a password to confirm a sensitive action. Actions
  // that could lock the owner out of their own account require it to be recent. Nullable because
  // sessions predating this column exist; those fall back to `createdAt`, which is the honest
  // answer for them (creating a session did involve authenticating).
  reauthAt: integer('reauth_at', { mode: 'timestamp' }),
});

// A short, human-readable audit trail for the account page. It deliberately stores only a parsed
// device label and coarse edge location, never an IP address or full user-agent.
export const securityEvents = sqliteTable('security_events', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  device: text('device'),
  location: text('location'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/*
 * Passkeys.
 *
 * The public key is the whole point: it is not a secret, so a leak of this table does not let anybody
 * sign in as anybody. That is the property passwords never had and the reason this is the front door
 * now rather than a setting.
 *
 * `id` is the credential id the authenticator generated (base64url), which is what a login response
 * gives us to look the key up by, so it is the natural primary key.
 */
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  /*
   * The authenticator's signature counter.
   *
   * Its only job is cloning detection: a counter that goes backwards means two things are answering
   * for one credential. Plenty of authenticators (most platform ones, including Apple's) always report
   * zero, so a zero counter can never be treated as suspicious, only a decrease from a non-zero one.
   */
  counter: integer('counter').notNull().default(0),
  /** Synced to a provider's cloud, so losing the device does not lose the key. Shown to the user. */
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  /** 'internal', 'hybrid', 'usb'... how it was reachable, for a useful label rather than a guess. */
  transports: text('transports'),
  /** Editable, because "iPhone" beats a base64 blob when deciding which key to remove. */
  label: text('label').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
});

/*
 * One in-flight WebAuthn ceremony.
 *
 * Server-side rather than in a cookie the client hands back, because a challenge has to be single-use.
 * The row is deleted the moment it is consumed, so a captured response cannot be replayed; a cookie
 * holding the challenge itself would be replayable until it expired.
 *
 * `userId` is null for a sign-in, where a discoverable credential tells us who it is only afterwards.
 */
export const webauthnChallenges = sqliteTable('webauthn_challenges', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  challenge: text('challenge').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
