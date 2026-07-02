import { beforeEach, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createGroup, getGroup } from '../src/groups.js';
import { InviteError, acceptInvite, createInvite, getInviteInfo } from '../src/invites.js';
import { invites } from '../src/db/schema.js';
import { testDb, seedPerson } from './helpers.js';

let db: ReturnType<typeof testDb>;
let alice: string;
let groupId: string;

beforeEach(async () => {
  db = testDb();
  alice = await seedPerson(db, 'Alice');
  groupId = (await createGroup(db, alice, 'Trip')).id;
});

describe('invites', () => {
  test('createInvite returns a token and public info shows the group as pending', async () => {
    const invite = await createInvite(db, alice, groupId);
    expect(invite.token).toHaveLength(32);
    const info = await getInviteInfo(db, invite.token);
    expect(info).toMatchObject({ groupName: 'Trip', status: 'pending', email: null });
  });

  test('accepting joins the group and flips status to accepted', async () => {
    const { token } = await createInvite(db, alice, groupId);
    const bob = await seedPerson(db, 'Bob');
    const result = await acceptInvite(db, bob, token);
    expect(result.groupId).toBe(groupId);
    const group = await getGroup(db, bob, groupId);
    expect(group.members.map((m) => m.displayName).sort()).toEqual(['Alice', 'Bob']);
    expect((await getInviteInfo(db, token)).status).toBe('accepted');
  });

  test('accepting is idempotent for an existing member but the invite is single-use', async () => {
    const { token } = await createInvite(db, alice, groupId);
    const bob = await seedPerson(db, 'Bob');
    await acceptInvite(db, bob, token);
    await expect(acceptInvite(db, bob, token)).rejects.toMatchObject({ code: 'ALREADY_ACCEPTED' });
  });

  test('an expired invite cannot be accepted', async () => {
    const { token } = await createInvite(db, alice, groupId);
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.token, token));
    expect((await getInviteInfo(db, token)).status).toBe('expired');
    const bob = await seedPerson(db, 'Bob');
    await expect(acceptInvite(db, bob, token)).rejects.toMatchObject({ code: 'EXPIRED' });
  });

  test('an unknown token is NOT_FOUND', async () => {
    await expect(getInviteInfo(db, 'nope')).rejects.toBeInstanceOf(InviteError);
    await expect(acceptInvite(db, alice, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
