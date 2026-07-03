// owewell's domain contract: the JSON shapes and constants exchanged between the API and the
// web app. Framework-free and money-representation-free (amounts are integer cents; splitting
// math lives in @aidenjang/shared). Timestamps are ISO strings, i.e. the wire form of the
// server's Date values. Keeping this in one package is what stops the two sides from drifting.

import type { SplitMethod } from '@aidenjang/shared';

export { SPLIT_METHODS } from '@aidenjang/shared';
export type { SplitMethod };

/** How a settlement was actually paid. Tag-only (no deep links), surfaced in the activity feed. */
export const PAYMENT_METHODS = ['venmo', 'paypal', 'zelle', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// --- Groups -----------------------------------------------------------------

export type GroupRole = 'OWNER' | 'MEMBER';

export interface GroupMember {
  userId: string;
  displayName: string;
  /** Null for name-only placeholders that aren't linked to a real account yet. */
  email: string | null;
  role: GroupRole;
  joinedAt: string;
  /** True for name-only members (no linked account). Only these can be renamed locally. */
  isPlaceholder: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  /** The viewer's net in this group. Positive: they're owed. Negative: they owe. */
  netCents: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  members: GroupMember[];
}

export interface Balance {
  userId: string;
  displayName: string;
  netCents: number;
}

// --- Expenses ---------------------------------------------------------------

/** Persisted expenses also carry the itemized method, which isn't a user-chosen split rule. */
export type ExpenseSplitMethod = SplitMethod | 'ITEMIZED';

export interface ExpenseSplit {
  userId: string;
  owedCents: number;
  /**
   * The value the payer originally entered for this participant under the split method
   * (EXACT: cents, PERCENT: basis points, SHARES: weight; null for EQUAL/ITEMIZED). Lets the
   * edit form prefill faithfully rather than reverse-engineering it from owedCents.
   */
  inputValue?: number | null;
}

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  payerId: string;
  splitMethod: ExpenseSplitMethod;
  createdAt: string;
  splits: ExpenseSplit[];
}

export interface SplitParticipantValue {
  userId: string;
  value?: number;
}

export interface CreateExpensePayload {
  description: string;
  amountCents: number;
  payerId: string;
  splitMethod: SplitMethod;
  participants: SplitParticipantValue[];
}

export interface ExpenseItemInput {
  name: string;
  amountCents: number;
  participantIds: string[];
}

export interface CreateItemizedPayload {
  description: string;
  payerId: string;
  taxCents: number;
  tipCents: number;
  items: ExpenseItemInput[];
}

/** Receipt OCR result: line items plus tax and tip, all in integer cents. */
export interface ExtractedReceipt {
  items: { name: string; amountCents: number }[];
  taxCents: number;
  tipCents: number;
}

// --- Settlements ------------------------------------------------------------

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  method: PaymentMethod | null;
  createdAt: string;
}

export interface RecordSettlementPayload {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  method?: PaymentMethod;
}

export interface SuggestedPayment {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountCents: number;
}

// --- Invites ----------------------------------------------------------------

export type InviteStatus = 'pending' | 'accepted' | 'expired';

export interface InviteInfo {
  groupName: string;
  email: string | null;
  status: InviteStatus;
}
