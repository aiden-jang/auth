import { computeItemizedSplit, computeSplit, type SplitMethod } from '@aidenjang/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DB } from './db/client.js';
import { requireMembership } from './groups.js';
import {
  expenseItemShares,
  expenseItems,
  expenseSplits,
  expenses,
  groupMembers,
  people,
  settlements,
} from './db/schema.js';

export type ExpenseErrorCode = 'INVALID_PAYER' | 'INVALID_PARTICIPANT' | 'INVALID_SPLIT' | 'NOT_FOUND';

export class ExpenseError extends Error {
  constructor(
    readonly code: ExpenseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExpenseError';
  }
}

export interface CreateExpenseInput {
  description: string;
  amountCents: number;
  payerId: string;
  splitMethod: SplitMethod;
  participants: { userId: string; value?: number }[];
  /** The date the expense happened (backdatable). Omit to use "now". */
  date?: Date;
}

export interface CreateItemizedExpenseInput {
  description: string;
  payerId: string;
  taxCents: number;
  tipCents: number;
  items: { name: string; amountCents: number; participantIds: string[] }[];
  date?: Date;
}

export interface ExpenseView {
  id: string;
  description: string;
  amountCents: number;
  payerId: string;
  splitMethod: string;
  createdAt: Date;
  /** The effective expense date (user-set date, else createdAt). Drives feed order + display. */
  date: Date;
  splits: { userId: string; owedCents: number; inputValue?: number | null }[];
  // Present only for ITEMIZED expenses, so the edit form can prefill the receipt.
  taxCents?: number;
  tipCents?: number;
  items?: { name: string; amountCents: number; participantIds: string[] }[];
}

export interface MemberBalance {
  userId: string;
  displayName: string;
  netCents: number;
}

async function memberPersonIds(db: DB, groupId: string): Promise<Set<string>> {
  const rows = await db.select({ personId: groupMembers.personId }).from(groupMembers).where(eq(groupMembers.groupId, groupId)).all();
  return new Set(rows.map((r) => r.personId));
}

/** Drop an expense's line items + their per-item shares (used when replacing on edit). */
async function clearItemizedRows(db: DB, expenseId: string): Promise<void> {
  const itemRows = await db.select({ id: expenseItems.id }).from(expenseItems).where(eq(expenseItems.expenseId, expenseId)).all();
  if (itemRows.length === 0) return;
  await db.delete(expenseItemShares).where(inArray(expenseItemShares.itemId, itemRows.map((r) => r.id)));
  await db.delete(expenseItems).where(eq(expenseItems.expenseId, expenseId));
}

export async function createExpense(db: DB, personId: string, groupId: string, input: CreateExpenseInput): Promise<ExpenseView> {
  await requireMembership(db, personId, groupId);
  const members = await memberPersonIds(db, groupId);
  if (!members.has(input.payerId)) throw new ExpenseError('INVALID_PAYER', 'The payer must be a member of the group.');
  if (input.participants.some((p) => !members.has(p.userId))) {
    throw new ExpenseError('INVALID_PARTICIPANT', 'Every participant must be a member of the group.');
  }

  let shares;
  try {
    shares = computeSplit(input.splitMethod, input.amountCents, input.participants);
  } catch (err) {
    throw new ExpenseError('INVALID_SPLIT', err instanceof Error ? err.message : 'Invalid split.');
  }
  const valueByPerson = new Map(input.participants.map((p) => [p.userId, p.value]));

  const id = crypto.randomUUID();
  await db.insert(expenses).values({
    id,
    groupId,
    payerId: input.payerId,
    createdById: personId,
    description: input.description,
    amountCents: input.amountCents,
    splitMethod: input.splitMethod,
    date: input.date ?? null,
  });
  await db.insert(expenseSplits).values(
    shares.map((s) => ({
      id: crypto.randomUUID(),
      expenseId: id,
      personId: s.userId,
      owedCents: s.owedCents,
      inputValue: valueByPerson.get(s.userId) ?? null,
    })),
  );
  return { id, description: input.description, amountCents: input.amountCents, payerId: input.payerId, splitMethod: input.splitMethod, createdAt: new Date(), date: input.date ?? new Date(), splits: shares.map((s) => ({ userId: s.userId, owedCents: s.owedCents })) };
}

/** Replace a simple (non-itemized) expense in place, recomputing its splits. Preserves createdAt. */
export async function updateExpense(db: DB, personId: string, groupId: string, expenseId: string, input: CreateExpenseInput): Promise<ExpenseView> {
  await requireMembership(db, personId, groupId);
  const existing = await db
    .select({ createdAt: expenses.createdAt })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
    .get();
  if (!existing) throw new ExpenseError('NOT_FOUND', 'That expense no longer exists.');
  const members = await memberPersonIds(db, groupId);
  if (!members.has(input.payerId)) throw new ExpenseError('INVALID_PAYER', 'The payer must be a member of the group.');
  if (input.participants.some((p) => !members.has(p.userId))) {
    throw new ExpenseError('INVALID_PARTICIPANT', 'Every participant must be a member of the group.');
  }

  let shares;
  try {
    shares = computeSplit(input.splitMethod, input.amountCents, input.participants);
  } catch (err) {
    throw new ExpenseError('INVALID_SPLIT', err instanceof Error ? err.message : 'Invalid split.');
  }
  const valueByPerson = new Map(input.participants.map((p) => [p.userId, p.value]));

  await db
    .update(expenses)
    .set({
      payerId: input.payerId,
      description: input.description,
      amountCents: input.amountCents,
      splitMethod: input.splitMethod,
      taxCents: 0,
      tipCents: 0,
      date: input.date ?? null,
    })
    .where(eq(expenses.id, expenseId));
  await clearItemizedRows(db, expenseId); // in case it used to be itemized
  await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  await db.insert(expenseSplits).values(
    shares.map((s) => ({
      id: crypto.randomUUID(),
      expenseId,
      personId: s.userId,
      owedCents: s.owedCents,
      inputValue: valueByPerson.get(s.userId) ?? null,
    })),
  );
  return { id: expenseId, description: input.description, amountCents: input.amountCents, payerId: input.payerId, splitMethod: input.splitMethod, createdAt: existing.createdAt, date: input.date ?? existing.createdAt, splits: shares.map((s) => ({ userId: s.userId, owedCents: s.owedCents })) };
}

export async function createItemizedExpense(db: DB, personId: string, groupId: string, input: CreateItemizedExpenseInput): Promise<ExpenseView> {
  await requireMembership(db, personId, groupId);
  const members = await memberPersonIds(db, groupId);
  if (!members.has(input.payerId)) throw new ExpenseError('INVALID_PAYER', 'The payer must be a member of the group.');
  const everyone = new Set(input.items.flatMap((i) => i.participantIds));
  if ([...everyone].some((pid) => !members.has(pid))) {
    throw new ExpenseError('INVALID_PARTICIPANT', 'Everyone on an item must be a group member.');
  }

  let shares;
  try {
    shares = computeItemizedSplit({
      items: input.items.map((i) => ({ amountCents: i.amountCents, participantIds: i.participantIds })),
      taxCents: input.taxCents,
      tipCents: input.tipCents,
    });
  } catch (err) {
    throw new ExpenseError('INVALID_SPLIT', err instanceof Error ? err.message : 'Invalid split.');
  }

  const amountCents = input.items.reduce((sum, i) => sum + i.amountCents, 0) + input.taxCents + input.tipCents;
  const id = crypto.randomUUID();
  await db.insert(expenses).values({
    id,
    groupId,
    payerId: input.payerId,
    createdById: personId,
    description: input.description,
    amountCents,
    splitMethod: 'ITEMIZED',
    taxCents: input.taxCents,
    tipCents: input.tipCents,
    date: input.date ?? null,
  });
  await db.insert(expenseSplits).values(
    shares.map((s) => ({ id: crypto.randomUUID(), expenseId: id, personId: s.userId, owedCents: s.owedCents })),
  );
  for (const item of input.items) {
    const itemId = crypto.randomUUID();
    await db.insert(expenseItems).values({ id: itemId, expenseId: id, name: item.name, amountCents: item.amountCents });
    await db.insert(expenseItemShares).values(
      item.participantIds.map((pid) => ({ id: crypto.randomUUID(), itemId, personId: pid })),
    );
  }
  return { id, description: input.description, amountCents, payerId: input.payerId, splitMethod: 'ITEMIZED', createdAt: new Date(), date: input.date ?? new Date(), splits: shares.map((s) => ({ userId: s.userId, owedCents: s.owedCents })) };
}

/** Replace an itemized expense in place: recompute item splits, swap items + shares. Preserves createdAt. */
export async function updateItemizedExpense(db: DB, personId: string, groupId: string, expenseId: string, input: CreateItemizedExpenseInput): Promise<ExpenseView> {
  await requireMembership(db, personId, groupId);
  const existing = await db
    .select({ createdAt: expenses.createdAt })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
    .get();
  if (!existing) throw new ExpenseError('NOT_FOUND', 'That expense no longer exists.');
  const members = await memberPersonIds(db, groupId);
  if (!members.has(input.payerId)) throw new ExpenseError('INVALID_PAYER', 'The payer must be a member of the group.');
  const everyone = new Set(input.items.flatMap((i) => i.participantIds));
  if ([...everyone].some((pid) => !members.has(pid))) {
    throw new ExpenseError('INVALID_PARTICIPANT', 'Everyone on an item must be a group member.');
  }

  let shares;
  try {
    shares = computeItemizedSplit({
      items: input.items.map((i) => ({ amountCents: i.amountCents, participantIds: i.participantIds })),
      taxCents: input.taxCents,
      tipCents: input.tipCents,
    });
  } catch (err) {
    throw new ExpenseError('INVALID_SPLIT', err instanceof Error ? err.message : 'Invalid split.');
  }
  const amountCents = input.items.reduce((sum, i) => sum + i.amountCents, 0) + input.taxCents + input.tipCents;

  await db
    .update(expenses)
    .set({
      payerId: input.payerId,
      description: input.description,
      amountCents,
      splitMethod: 'ITEMIZED',
      taxCents: input.taxCents,
      tipCents: input.tipCents,
      date: input.date ?? null,
    })
    .where(eq(expenses.id, expenseId));
  await clearItemizedRows(db, expenseId);
  await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  await db.insert(expenseSplits).values(
    shares.map((s) => ({ id: crypto.randomUUID(), expenseId, personId: s.userId, owedCents: s.owedCents })),
  );
  for (const item of input.items) {
    const itemId = crypto.randomUUID();
    await db.insert(expenseItems).values({ id: itemId, expenseId, name: item.name, amountCents: item.amountCents });
    await db.insert(expenseItemShares).values(
      item.participantIds.map((pid) => ({ id: crypto.randomUUID(), itemId, personId: pid })),
    );
  }
  return { id: expenseId, description: input.description, amountCents, payerId: input.payerId, splitMethod: 'ITEMIZED', createdAt: existing.createdAt, date: input.date ?? existing.createdAt, splits: shares.map((s) => ({ userId: s.userId, owedCents: s.owedCents })) };
}

export async function listExpenses(db: DB, personId: string, groupId: string): Promise<ExpenseView[]> {
  await requireMembership(db, personId, groupId);
  const rows = await db.select().from(expenses).where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt))).orderBy(desc(expenses.createdAt)).all();
  if (rows.length === 0) return [];
  const splitRows = await db
    .select({ expenseId: expenseSplits.expenseId, userId: expenseSplits.personId, owedCents: expenseSplits.owedCents, inputValue: expenseSplits.inputValue })
    .from(expenseSplits)
    .where(inArray(expenseSplits.expenseId, rows.map((r) => r.id)))
    .all();
  const byExpense = new Map<string, { userId: string; owedCents: number; inputValue: number | null }[]>();
  for (const s of splitRows) {
    const list = byExpense.get(s.expenseId) ?? [];
    list.push({ userId: s.userId, owedCents: s.owedCents, inputValue: s.inputValue });
    byExpense.set(s.expenseId, list);
  }

  // For itemized expenses, attach line items + their participants so the edit form can prefill.
  const itemsByExpense = new Map<string, { name: string; amountCents: number; participantIds: string[] }[]>();
  const itemizedIds = rows.filter((r) => r.splitMethod === 'ITEMIZED').map((r) => r.id);
  if (itemizedIds.length > 0) {
    const itemRows = await db
      .select({ id: expenseItems.id, expenseId: expenseItems.expenseId, name: expenseItems.name, amountCents: expenseItems.amountCents })
      .from(expenseItems)
      .where(inArray(expenseItems.expenseId, itemizedIds))
      .all();
    const sharesByItem = new Map<string, string[]>();
    if (itemRows.length > 0) {
      const shareRows = await db
        .select({ itemId: expenseItemShares.itemId, personId: expenseItemShares.personId })
        .from(expenseItemShares)
        .where(inArray(expenseItemShares.itemId, itemRows.map((i) => i.id)))
        .all();
      for (const s of shareRows) {
        const l = sharesByItem.get(s.itemId) ?? [];
        l.push(s.personId);
        sharesByItem.set(s.itemId, l);
      }
    }
    for (const it of itemRows) {
      const l = itemsByExpense.get(it.expenseId) ?? [];
      l.push({ name: it.name, amountCents: it.amountCents, participantIds: sharesByItem.get(it.id) ?? [] });
      itemsByExpense.set(it.expenseId, l);
    }
  }

  return rows.map((e) => ({
    id: e.id,
    description: e.description,
    amountCents: e.amountCents,
    payerId: e.payerId,
    splitMethod: e.splitMethod,
    createdAt: e.createdAt,
    date: e.date ?? e.createdAt,
    splits: byExpense.get(e.id) ?? [],
    ...(e.splitMethod === 'ITEMIZED'
      ? { taxCents: e.taxCents, tipCents: e.tipCents, items: itemsByExpense.get(e.id) ?? [] }
      : {}),
  }));
}

export async function deleteExpense(db: DB, personId: string, groupId: string, expenseId: string): Promise<void> {
  await requireMembership(db, personId, groupId);
  const e = await db.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt))).get();
  if (!e) throw new ExpenseError('NOT_FOUND', 'That expense is already gone.');
  await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, expenseId));
}

/** Net per member from live expenses + settlements; always sums to zero. */
export async function getBalances(db: DB, personId: string, groupId: string): Promise<MemberBalance[]> {
  await requireMembership(db, personId, groupId);
  const members = await db
    .select({ personId: groupMembers.personId, displayName: people.displayName, joinedAt: groupMembers.joinedAt })
    .from(groupMembers)
    .innerJoin(people, eq(groupMembers.personId, people.id))
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(groupMembers.joinedAt)
    .all();
  const net = new Map<string, number>(members.map((m) => [m.personId, 0]));
  const bump = (p: string, d: number): void => {
    net.set(p, (net.get(p) ?? 0) + d);
  };

  const exps = await db.select({ id: expenses.id, payerId: expenses.payerId, amountCents: expenses.amountCents }).from(expenses).where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt))).all();
  for (const e of exps) bump(e.payerId, e.amountCents);
  if (exps.length) {
    const splitRows = await db.select({ personId: expenseSplits.personId, owedCents: expenseSplits.owedCents }).from(expenseSplits).where(inArray(expenseSplits.expenseId, exps.map((e) => e.id))).all();
    for (const s of splitRows) bump(s.personId, -s.owedCents);
  }

  const setl = await db.select({ fromPersonId: settlements.fromPersonId, toPersonId: settlements.toPersonId, amountCents: settlements.amountCents }).from(settlements).where(eq(settlements.groupId, groupId)).all();
  for (const s of setl) {
    bump(s.fromPersonId, s.amountCents);
    bump(s.toPersonId, -s.amountCents);
  }

  return members.map((m) => ({ userId: m.personId, displayName: m.displayName, netCents: net.get(m.personId) ?? 0 }));
}
