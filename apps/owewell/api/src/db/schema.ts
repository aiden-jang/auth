import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// owewell-local identity. Real accounts link via authUserId (from the shared auth service);
// placeholders (name-only people added to a group, no login) have authUserId = null.
// owewell never foreign-keys into the auth service's DB; it references people.id.
export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  authUserId: text('auth_user_id').unique(),
  displayName: text('display_name').notNull(),
  isPlaceholder: integer('is_placeholder', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdById: text('created_by_id')
    .notNull()
    .references(() => people.id),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const groupMembers = sqliteTable(
  'group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('MEMBER'), // OWNER | MEMBER
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    groupPerson: uniqueIndex('gm_group_person').on(t.groupId, t.personId),
    byPerson: index('gm_person').on(t.personId),
  }),
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    payerId: text('payer_id')
      .notNull()
      .references(() => people.id),
    createdById: text('created_by_id')
      .notNull()
      .references(() => people.id),
    description: text('description').notNull(),
    // Always integer cents. amountCents is the grand total (items + tax + tip for ITEMIZED).
    amountCents: integer('amount_cents').notNull(),
    splitMethod: text('split_method').notNull(), // EQUAL | EXACT | PERCENT | SHARES | ITEMIZED
    taxCents: integer('tax_cents').notNull().default(0),
    tipCents: integer('tip_cents').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }), // soft delete; keeps balances auditable
  },
  (t) => ({ byGroup: index('exp_group').on(t.groupId) }),
);

export const expenseSplits = sqliteTable(
  'expense_splits',
  {
    id: text('id').primaryKey(),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    owedCents: integer('owed_cents').notNull(),
    // Raw input that produced owedCents (EXACT: cents, PERCENT: basis points, SHARES: weight; null for EQUAL).
    inputValue: integer('input_value'),
  },
  (t) => ({ expensePerson: uniqueIndex('es_expense_person').on(t.expenseId, t.personId) }),
);

export const expenseItems = sqliteTable('expense_items', {
  id: text('id').primaryKey(),
  expenseId: text('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  amountCents: integer('amount_cents').notNull(),
});

export const expenseItemShares = sqliteTable(
  'expense_item_shares',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => expenseItems.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
  },
  (t) => ({ itemPerson: uniqueIndex('eis_item_person').on(t.itemId, t.personId) }),
);

export const settlements = sqliteTable(
  'settlements',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    fromPersonId: text('from_person_id')
      .notNull()
      .references(() => people.id),
    toPersonId: text('to_person_id')
      .notNull()
      .references(() => people.id),
    amountCents: integer('amount_cents').notNull(),
    // Optional payment-method tag: venmo | paypal | zelle | cash | other (surfaced in the feed).
    method: text('method'),
    createdById: text('created_by_id')
      .notNull()
      .references(() => people.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({ byGroup: index('settle_group').on(t.groupId) }),
);

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  groupId: text('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  // The raw token lives in the share link; unique and unguessable.
  token: text('token').notNull().unique(),
  // Optional addressee (lowercased). Null = anyone with the link.
  email: text('email'),
  invitedById: text('invited_by_id')
    .notNull()
    .references(() => people.id),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
});
