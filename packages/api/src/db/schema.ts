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
