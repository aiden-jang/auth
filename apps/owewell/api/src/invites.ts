import type { InviteInfo, InviteStatus } from '@owewell/core';
import { and, eq } from 'drizzle-orm';
import type { DB } from './db/client.js';
import { requireMembership } from './groups.js';
import { groupMembers, groups, invites } from './db/schema.js';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type InviteErrorCode = 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_ACCEPTED';

export class InviteError extends Error {
  constructor(
    readonly code: InviteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InviteError';
  }
}

export interface InviteView {
  token: string;
  email: string | null;
  expiresAt: Date;
}

/** 24 random bytes, URL-safe. Unguessable; it's the only thing gating the invite link. */
function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createInvite(
  db: DB,
  personId: string,
  groupId: string,
  email?: string,
): Promise<InviteView> {
  await requireMembership(db, personId, groupId);
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(invites).values({
    id: crypto.randomUUID(),
    groupId,
    token,
    email: email ? email.trim().toLowerCase() : null,
    invitedById: personId,
    expiresAt,
  });
  return { token, email: email ?? null, expiresAt };
}

/** Public lookup so the invite landing page can show the group before sign-in. */
export async function getInviteInfo(db: DB, token: string): Promise<InviteInfo> {
  const row = await db
    .select({
      email: invites.email,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      groupName: groups.name,
    })
    .from(invites)
    .innerJoin(groups, eq(invites.groupId, groups.id))
    .where(eq(invites.token, token))
    .get();
  if (!row) throw new InviteError('NOT_FOUND', 'This invite link is not valid.');
  const status: InviteStatus = row.acceptedAt
    ? 'accepted'
    : row.expiresAt.getTime() <= Date.now()
      ? 'expired'
      : 'pending';
  return { groupName: row.groupName, email: row.email, status };
}

export async function acceptInvite(db: DB, personId: string, token: string): Promise<{ groupId: string }> {
  const invite = await db
    .select({ groupId: invites.groupId, expiresAt: invites.expiresAt, acceptedAt: invites.acceptedAt })
    .from(invites)
    .where(eq(invites.token, token))
    .get();
  if (!invite) throw new InviteError('NOT_FOUND', 'This invite link is not valid.');
  if (invite.acceptedAt) throw new InviteError('ALREADY_ACCEPTED', 'This invite has already been used.');
  if (invite.expiresAt.getTime() <= Date.now()) throw new InviteError('EXPIRED', 'This invite has expired.');

  // Idempotent join: if they're already a member, just consume the invite.
  const existing = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, invite.groupId), eq(groupMembers.personId, personId)))
    .get();
  if (!existing) {
    await db.insert(groupMembers).values({
      id: crypto.randomUUID(),
      groupId: invite.groupId,
      personId,
      role: 'MEMBER',
    });
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.token, token));
  return { groupId: invite.groupId };
}
