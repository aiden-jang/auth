import { and, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { DB } from './db/client.js';
import { pruneOrphanPlaceholders } from './people.js';
import {
  expenseItemShares,
  expenseItems,
  expenseSplits,
  expenses,
  groupMembers,
  groups,
  invites,
  people,
  settlements,
} from './db/schema.js';

export type GroupErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_MEMBER'
  | 'NOT_OWNER'
  | 'CANNOT_REMOVE_OWNER'
  | 'NOT_PLACEHOLDER'
  | 'HAS_ACTIVITY';

export class GroupError extends Error {
  constructor(
    readonly code: GroupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GroupError';
  }
}

export interface GroupMemberView {
  userId: string; // owewell person id (opaque member id to the frontend)
  displayName: string;
  email: string | null;
  role: string;
  joinedAt: Date;
  isPlaceholder: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  viewerId: string; // the caller's person id, so the UI knows which member is "me"
  members: GroupMemberView[];
}

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: Date;
  memberCount: number;
  netCents: number;
}

/** Throws NOT_FOUND if the person is not a member (which doubles as "does not exist"). */
export async function requireMembership(db: DB, personId: string, groupId: string): Promise<string> {
  const m = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, personId)))
    .get();
  if (!m) throw new GroupError('NOT_FOUND', 'Group not found.');
  return m.role;
}

async function requireOwner(db: DB, personId: string, groupId: string): Promise<void> {
  const role = await requireMembership(db, personId, groupId);
  if (role !== 'OWNER') throw new GroupError('NOT_OWNER', 'Only the group owner can do that.');
}

async function membersOf(db: DB, groupId: string): Promise<GroupMemberView[]> {
  const rows = await db
    .select({
      userId: groupMembers.personId,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      displayName: people.displayName,
      isPlaceholder: people.isPlaceholder,
    })
    .from(groupMembers)
    .innerJoin(people, eq(groupMembers.personId, people.id))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt)
    .all();
  return rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    email: null, // real users' emails live in the auth service, not owewell
    role: r.role,
    joinedAt: r.joinedAt,
    isPlaceholder: r.isPlaceholder,
  }));
}

export async function getGroup(db: DB, personId: string, groupId: string): Promise<GroupDetail> {
  await requireMembership(db, personId, groupId);
  const g = await db.select().from(groups).where(eq(groups.id, groupId)).get();
  if (!g) throw new GroupError('NOT_FOUND', 'Group not found.');
  return {
    id: g.id,
    name: g.name,
    createdById: g.createdById,
    createdAt: g.createdAt,
    viewerId: personId,
    members: await membersOf(db, groupId),
  };
}

export async function createGroup(db: DB, personId: string, name: string): Promise<GroupDetail> {
  const id = crypto.randomUUID();
  await db.insert(groups).values({ id, name, createdById: personId });
  await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: id, personId, role: 'OWNER' });
  return getGroup(db, personId, id);
}

export async function listGroups(db: DB, personId: string): Promise<GroupSummary[]> {
  const mine = await db
    .select({ id: groups.id, name: groups.name, createdAt: groups.createdAt })
    .from(groups)
    .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.personId, personId))
    .orderBy(desc(groups.createdAt))
    .all();
  const ids = mine.map((g) => g.id);
  if (ids.length === 0) return [];

  const counts = await db
    .select({ groupId: groupMembers.groupId, c: count() })
    .from(groupMembers)
    .where(inArray(groupMembers.groupId, ids))
    .groupBy(groupMembers.groupId)
    .all();
  const countMap = new Map(counts.map((r) => [r.groupId, Number(r.c)]));

  // The caller's net per group: + what they paid, - what they owe, +/- settlements.
  const net = new Map<string, number>(ids.map((id) => [id, 0]));
  const bump = (g: string, d: number): void => {
    net.set(g, (net.get(g) ?? 0) + d);
  };

  const paid = await db
    .select({ groupId: expenses.groupId, amountCents: expenses.amountCents })
    .from(expenses)
    .where(and(inArray(expenses.groupId, ids), eq(expenses.payerId, personId), isNull(expenses.deletedAt)))
    .all();
  for (const e of paid) bump(e.groupId, e.amountCents);

  const owed = await db
    .select({ groupId: expenses.groupId, owedCents: expenseSplits.owedCents })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
    .where(and(eq(expenseSplits.personId, personId), inArray(expenses.groupId, ids), isNull(expenses.deletedAt)))
    .all();
  for (const s of owed) bump(s.groupId, -s.owedCents);

  const setl = await db
    .select({
      groupId: settlements.groupId,
      fromPersonId: settlements.fromPersonId,
      toPersonId: settlements.toPersonId,
      amountCents: settlements.amountCents,
    })
    .from(settlements)
    .where(
      and(
        inArray(settlements.groupId, ids),
        or(eq(settlements.fromPersonId, personId), eq(settlements.toPersonId, personId)),
      ),
    )
    .all();
  for (const s of setl) {
    if (s.fromPersonId === personId) bump(s.groupId, s.amountCents);
    if (s.toPersonId === personId) bump(s.groupId, -s.amountCents);
  }

  return mine.map((g) => ({
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    memberCount: countMap.get(g.id) ?? 0,
    netCents: net.get(g.id) ?? 0,
  }));
}

export async function renameGroup(db: DB, personId: string, groupId: string, name: string): Promise<GroupDetail> {
  await requireOwner(db, personId, groupId);
  await db.update(groups).set({ name }).where(eq(groups.id, groupId));
  return getGroup(db, personId, groupId);
}

export async function deleteGroup(db: DB, personId: string, groupId: string): Promise<void> {
  await requireOwner(db, personId, groupId);
  // Explicit cascade (don't rely on SQLite FK enforcement in D1).
  const exps = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.groupId, groupId)).all();
  const expIds = exps.map((e) => e.id);
  if (expIds.length) {
    const items = await db.select({ id: expenseItems.id }).from(expenseItems).where(inArray(expenseItems.expenseId, expIds)).all();
    const itemIds = items.map((i) => i.id);
    if (itemIds.length) await db.delete(expenseItemShares).where(inArray(expenseItemShares.itemId, itemIds));
    await db.delete(expenseItems).where(inArray(expenseItems.expenseId, expIds));
    await db.delete(expenseSplits).where(inArray(expenseSplits.expenseId, expIds));
    await db.delete(expenses).where(inArray(expenses.id, expIds));
  }
  await db.delete(settlements).where(eq(settlements.groupId, groupId));
  await db.delete(invites).where(eq(invites.groupId, groupId));
  await db.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
  await db.delete(groups).where(eq(groups.id, groupId));
  await pruneOrphanPlaceholders(db);
}

/**
 * Rename a member. Only name-only placeholders can be renamed here; a real account owns its
 * own display name (synced from the auth service on each sign-in), so renaming it locally
 * would just be overwritten. Any member may fix a placeholder's name.
 */
export async function renameMember(
  db: DB,
  actingPersonId: string,
  groupId: string,
  targetPersonId: string,
  name: string,
): Promise<GroupMemberView> {
  await requireMembership(db, actingPersonId, groupId);
  const membership = await db
    .select({ role: groupMembers.role, joinedAt: groupMembers.joinedAt })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, targetPersonId)))
    .get();
  if (!membership) throw new GroupError('NOT_FOUND', 'They are not in this group.');
  const person = await db
    .select({ isPlaceholder: people.isPlaceholder, authUserId: people.authUserId })
    .from(people)
    .where(eq(people.id, targetPersonId))
    .get();
  if (!person || !person.isPlaceholder || person.authUserId) {
    throw new GroupError('NOT_PLACEHOLDER', 'Only name-only members can be renamed; real accounts manage their own name.');
  }
  await db.update(people).set({ displayName: name }).where(eq(people.id, targetPersonId));
  return {
    userId: targetPersonId,
    displayName: name,
    email: null,
    role: membership.role,
    joinedAt: membership.joinedAt,
    isPlaceholder: true,
  };
}

/** Add a name-only person (no account) to the group, backed by a placeholder people row. */
export async function addPlaceholderMember(db: DB, personId: string, groupId: string, name: string): Promise<GroupMemberView> {
  await requireMembership(db, personId, groupId);
  const newPersonId = crypto.randomUUID();
  await db.insert(people).values({ id: newPersonId, displayName: name, isPlaceholder: true });
  await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId, personId: newPersonId, role: 'MEMBER' });
  return {
    userId: newPersonId,
    displayName: name,
    email: null,
    role: 'MEMBER',
    joinedAt: new Date(),
    isPlaceholder: true,
  };
}

/** Remove a member (or leave). Owner can remove others; anyone can leave; owner can't be removed;
 * nobody with ledger activity can be removed until it's cleared. */
export async function removeMember(db: DB, actingPersonId: string, groupId: string, targetPersonId: string): Promise<void> {
  await requireMembership(db, actingPersonId, groupId);
  const target = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, targetPersonId)))
    .get();
  if (!target) throw new GroupError('NOT_FOUND', 'They are not in this group.');
  if (target.role === 'OWNER') {
    throw new GroupError('CANNOT_REMOVE_OWNER', 'The owner cannot be removed; delete the group instead.');
  }
  if (targetPersonId !== actingPersonId) {
    await requireOwner(db, actingPersonId, groupId);
  }

  const [asPayer, asSplit, asShare, asSettle] = await Promise.all([
    db.select({ c: count() }).from(expenses).where(and(eq(expenses.groupId, groupId), eq(expenses.payerId, targetPersonId))).get(),
    db.select({ c: count() }).from(expenseSplits).innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id)).where(and(eq(expenses.groupId, groupId), eq(expenseSplits.personId, targetPersonId))).get(),
    db.select({ c: count() }).from(expenseItemShares).innerJoin(expenseItems, eq(expenseItemShares.itemId, expenseItems.id)).innerJoin(expenses, eq(expenseItems.expenseId, expenses.id)).where(and(eq(expenses.groupId, groupId), eq(expenseItemShares.personId, targetPersonId))).get(),
    db.select({ c: count() }).from(settlements).where(and(eq(settlements.groupId, groupId), or(eq(settlements.fromPersonId, targetPersonId), eq(settlements.toPersonId, targetPersonId)))).get(),
  ]);
  if ((asPayer?.c ?? 0) || (asSplit?.c ?? 0) || (asShare?.c ?? 0) || (asSettle?.c ?? 0)) {
    throw new GroupError('HAS_ACTIVITY', "They're already in expenses here. Settle and clear those first.");
  }

  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, targetPersonId)));
  await pruneOrphanPlaceholders(db);
}
