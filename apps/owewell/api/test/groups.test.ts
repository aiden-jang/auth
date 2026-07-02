import { beforeEach, describe, expect, test } from 'vitest';
import {
  GroupError,
  addPlaceholderMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeMember,
  renameGroup,
} from '../src/groups.js';
import { testDb, seedPerson } from './helpers.js';

let alice: string;
beforeEach(async () => {
  alice = await seedPerson(testDb(), 'Alice');
});

describe('groups', () => {
  test('createGroup adds the creator as OWNER', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    expect(group.name).toBe('Trip');
    expect(group.createdById).toBe(alice);
    expect(group.members).toHaveLength(1);
    expect(group.members[0]).toMatchObject({ userId: alice, role: 'OWNER', displayName: 'Alice' });
  });

  test('addPlaceholderMember creates a name-only member', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const bob = await addPlaceholderMember(db, alice, group.id, 'Bob');
    expect(bob).toMatchObject({ displayName: 'Bob', role: 'MEMBER', email: null });
    const fetched = await getGroup(db, alice, group.id);
    expect(fetched.members.map((m) => m.displayName).sort()).toEqual(['Alice', 'Bob']);
  });

  test('listGroups reports member count and the viewer net', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    await addPlaceholderMember(db, alice, group.id, 'Bob');
    const summaries = await listGroups(db, alice);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: group.id, memberCount: 2, netCents: 0 });
  });

  test('renameGroup requires ownership', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const bob = await seedPerson(db, 'Bob');
    // Bob is not even a member: membership check fails first.
    await expect(renameGroup(db, bob, group.id, 'Hijacked')).rejects.toBeInstanceOf(GroupError);
    const renamed = await renameGroup(db, alice, group.id, 'Weekend');
    expect(renamed.name).toBe('Weekend');
  });

  test('a non-owner member cannot rename (NOT_OWNER)', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const memberId = (await addPlaceholderMember(db, alice, group.id, 'Bob')).userId;
    await expect(renameGroup(db, memberId, group.id, 'Nope')).rejects.toMatchObject({
      code: 'NOT_OWNER',
    });
  });

  test('cannot remove the owner; deleteGroup cascades', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    await expect(removeMember(db, alice, group.id, alice)).rejects.toMatchObject({
      code: 'CANNOT_REMOVE_OWNER',
    });
    await deleteGroup(db, alice, group.id);
    await expect(getGroup(db, alice, group.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('unknown group is NOT_FOUND', async () => {
    await expect(getGroup(testDb(), alice, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
