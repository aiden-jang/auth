import { computeSplit, type SplitMethod } from '@aidenjang/shared';
import type { DB } from './db/client.js';
import { addPlaceholderMember, createGroup } from './groups.js';
import { createExpense } from './expenses.js';

export type QuickSplitErrorCode = 'NO_PAYER' | 'TOO_MANY_YOU' | 'INVALID_SPLIT';

export class QuickSplitError extends Error {
  constructor(
    readonly code: QuickSplitErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuickSplitError';
  }
}

export interface QuickSplitParticipant {
  name: string;
  value?: number;
  isPayer?: boolean;
  isYou?: boolean;
}

export interface QuickSplitInput {
  description: string;
  amountCents: number;
  splitMethod: SplitMethod;
  participants: QuickSplitParticipant[];
}

/**
 * Turn a signed-out calculation into a saved group: the saving user owns it, every other
 * person becomes a name-only placeholder member, and the split becomes the first expense.
 * The split math is validated up front so a half-built group is never created.
 */
export async function createQuickSplit(
  db: DB,
  personId: string,
  input: QuickSplitInput,
): Promise<{ groupId: string }> {
  if (input.participants.filter((p) => p.isPayer).length !== 1) {
    throw new QuickSplitError('NO_PAYER', 'Mark exactly one person as the payer.');
  }
  if (input.participants.filter((p) => p.isYou).length > 1) {
    throw new QuickSplitError('TOO_MANY_YOU', 'Only one person can be you.');
  }

  try {
    computeSplit(
      input.splitMethod,
      input.amountCents,
      input.participants.map((p, i) =>
        p.value === undefined ? { userId: `p${i}` } : { userId: `p${i}`, value: p.value },
      ),
    );
  } catch (err) {
    throw new QuickSplitError('INVALID_SPLIT', err instanceof Error ? err.message : 'Invalid split.');
  }

  const name = input.description.trim() || 'Quick split';
  const group = await createGroup(db, personId, name);

  const resolved: { userId: string; value?: number; isPayer: boolean }[] = [];
  for (const p of input.participants) {
    const uid = p.isYou ? personId : (await addPlaceholderMember(db, personId, group.id, p.name)).userId;
    resolved.push(
      p.value === undefined
        ? { userId: uid, isPayer: Boolean(p.isPayer) }
        : { userId: uid, value: p.value, isPayer: Boolean(p.isPayer) },
    );
  }

  const payer = resolved.find((r) => r.isPayer);
  if (!payer) throw new QuickSplitError('NO_PAYER', 'Mark exactly one person as the payer.');

  await createExpense(db, personId, group.id, {
    description: name,
    amountCents: input.amountCents,
    payerId: payer.userId,
    splitMethod: input.splitMethod,
    participants: resolved.map((r) =>
      r.value === undefined ? { userId: r.userId } : { userId: r.userId, value: r.value },
    ),
  });

  return { groupId: group.id };
}
