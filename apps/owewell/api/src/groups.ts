import { computeSplit } from '@aidenjang/shared';
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
  | 'NOT_EDITABLE'
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
  // Payment handles (without @ / $), for settle-up deep links. Null when unset.
  venmoHandle: string | null;
  cashappCashtag: string | null;
  paypalHandle: string | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  archived: boolean;
  viewerId: string; // the caller's person id, so the UI knows which member is "me"
  members: GroupMemberView[];
}

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: Date;
  archived: boolean;
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
      venmoHandle: people.venmoHandle,
      cashappCashtag: people.cashappCashtag,
      paypalHandle: people.paypalHandle,
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
    venmoHandle: r.venmoHandle,
    cashappCashtag: r.cashappCashtag,
    paypalHandle: r.paypalHandle,
  }));
}

/** One member's view, freshly read (includes payment handles). Throws NOT_FOUND if absent. */
async function memberView(db: DB, groupId: string, personId: string): Promise<GroupMemberView> {
  const m = (await membersOf(db, groupId)).find((x) => x.userId === personId);
  if (!m) throw new GroupError('NOT_FOUND', 'They are not in this group.');
  return m;
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
    archived: g.archivedAt !== null,
    viewerId: personId,
    members: await membersOf(db, groupId),
  };
}

/** Archive (or restore) a group. Owner-only. Archiving hides it from the active list but
 *  keeps every expense, settlement, and balance intact. */
export async function setGroupArchived(db: DB, personId: string, groupId: string, archived: boolean): Promise<GroupDetail> {
  await requireOwner(db, personId, groupId);
  await db.update(groups).set({ archivedAt: archived ? new Date() : null }).where(eq(groups.id, groupId));
  return getGroup(db, personId, groupId);
}

export async function createGroup(db: DB, personId: string, name: string): Promise<GroupDetail> {
  const id = crypto.randomUUID();
  await db.insert(groups).values({ id, name, createdById: personId });
  await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId: id, personId, role: 'OWNER' });
  return getGroup(db, personId, id);
}

export async function listGroups(db: DB, personId: string): Promise<GroupSummary[]> {
  const mine = await db
    .select({ id: groups.id, name: groups.name, createdAt: groups.createdAt, archivedAt: groups.archivedAt })
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
    archived: g.archivedAt !== null,
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
  return memberView(db, groupId, targetPersonId);
}

export interface PaymentHandles {
  venmoHandle: string | null;
  cashappCashtag: string | null;
  paypalHandle: string | null;
}

/** What the endpoint accepts: an omitted field is left unchanged; a blank string clears it. */
export interface PaymentHandleInput {
  venmoHandle?: string | undefined;
  cashappCashtag?: string | undefined;
  paypalHandle?: string | undefined;
}

/**
 * Set a member's payment handles (for settle-up deep links). You may edit your
 * own handles, or those of a name-only placeholder you're in a group with; real
 * accounts other than yourself manage their own. Empty strings clear a handle.
 */
export async function setPaymentHandles(
  db: DB,
  actingPersonId: string,
  groupId: string,
  targetPersonId: string,
  handles: PaymentHandleInput,
): Promise<GroupMemberView> {
  await requireMembership(db, actingPersonId, groupId);
  await requireMembership(db, targetPersonId, groupId); // target must be in the group too
  if (targetPersonId !== actingPersonId) {
    const person = await db
      .select({ isPlaceholder: people.isPlaceholder })
      .from(people)
      .where(eq(people.id, targetPersonId))
      .get();
    if (!person?.isPlaceholder) {
      throw new GroupError('NOT_EDITABLE', 'Only you can set your own payment handles.');
    }
  }
  // Normalize: trim, strip a leading @ / $, and treat blank as clearing (null).
  const clean = (v: string | undefined): string | null | undefined => {
    if (v === undefined) return undefined; // not provided → leave unchanged
    const t = v.trim().replace(/^[@$]/, '');
    return t === '' ? null : t;
  };
  const patch: Partial<PaymentHandles> = {};
  const venmo = clean(handles.venmoHandle);
  const cashapp = clean(handles.cashappCashtag);
  const paypal = clean(handles.paypalHandle);
  if (venmo !== undefined) patch.venmoHandle = venmo;
  if (cashapp !== undefined) patch.cashappCashtag = cashapp;
  if (paypal !== undefined) patch.paypalHandle = paypal;
  if (Object.keys(patch).length > 0) {
    await db.update(people).set(patch).where(eq(people.id, targetPersonId));
  }
  return memberView(db, groupId, targetPersonId);
}

/**
 * When a member joins, fold them into the expenses that were split evenly among *everyone*.
 * Only EQUAL expenses whose participant set is exactly the prior membership are touched — a
 * shared dinner re-divides to include the newcomer, while deliberate subset splits and
 * EXACT/PERCENT/SHARES/itemized expenses (which encode specific allocations) are left alone.
 */
export async function resplitSharedEqualExpenses(
  db: DB,
  groupId: string,
  priorMemberIds: string[],
  newMemberId: string,
): Promise<void> {
  if (priorMemberIds.length === 0) return;
  const priorSet = new Set(priorMemberIds);
  const eqExpenses = await db
    .select({ id: expenses.id, amountCents: expenses.amountCents })
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.splitMethod, 'EQUAL'), isNull(expenses.deletedAt)))
    .all();
  for (const e of eqExpenses) {
    const parts = (
      await db.select({ personId: expenseSplits.personId }).from(expenseSplits).where(eq(expenseSplits.expenseId, e.id)).all()
    ).map((r) => r.personId);
    // Only "everyone" expenses: the participant set must match the prior membership exactly.
    if (parts.length !== priorSet.size || parts.some((p) => !priorSet.has(p))) continue;
    const shares = computeSplit(
      'EQUAL',
      e.amountCents,
      [...priorMemberIds, newMemberId].map((userId) => ({ userId })),
    );
    await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, e.id));
    await db.insert(expenseSplits).values(
      shares.map((s) => ({ id: crypto.randomUUID(), expenseId: e.id, personId: s.userId, owedCents: s.owedCents })),
    );
  }
}

/** Add a name-only person (no account) to the group, backed by a placeholder people row. */
export async function addPlaceholderMember(db: DB, personId: string, groupId: string, name: string): Promise<GroupMemberView> {
  await requireMembership(db, personId, groupId);
  const priorMemberIds = (
    await db.select({ id: groupMembers.personId }).from(groupMembers).where(eq(groupMembers.groupId, groupId)).all()
  ).map((r) => r.id);
  const newPersonId = crypto.randomUUID();
  await db.insert(people).values({ id: newPersonId, displayName: name, isPlaceholder: true });
  await db.insert(groupMembers).values({ id: crypto.randomUUID(), groupId, personId: newPersonId, role: 'MEMBER' });
  await resplitSharedEqualExpenses(db, groupId, priorMemberIds, newPersonId);
  return {
    userId: newPersonId,
    displayName: name,
    email: null,
    role: 'MEMBER',
    joinedAt: new Date(),
    isPlaceholder: true,
    venmoHandle: null,
    cashappCashtag: null,
    paypalHandle: null,
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
