import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Shared identity: one account per person across every app. App-specific data
// (owewell's placeholder members, etc.) lives in each app's own D1, not here.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  // Stored already lowercased + trimmed by the app layer.
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
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
});
