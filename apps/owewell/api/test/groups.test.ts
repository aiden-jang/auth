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
  renameMember,
  setGroupArchived,
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

  test('renameMember renames a placeholder', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const bob = (await addPlaceholderMember(db, alice, group.id, 'Bob')).userId;
    const renamed = await renameMember(db, alice, group.id, bob, 'Bobby');
    expect(renamed.displayName).toBe('Bobby');
    const fetched = await getGroup(db, alice, group.id);
    expect(fetched.members.find((m) => m.userId === bob)?.displayName).toBe('Bobby');
  });

  test('archive hides the group from the active flag; unarchive restores it', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    expect((await listGroups(db, alice))[0]?.archived).toBe(false);

    const archived = await setGroupArchived(db, alice, group.id, true);
    expect(archived.archived).toBe(true);
    expect((await listGroups(db, alice))[0]?.archived).toBe(true);
    expect((await getGroup(db, alice, group.id)).archived).toBe(true);

    const restored = await setGroupArchived(db, alice, group.id, false);
    expect(restored.archived).toBe(false);
  });

  test('an archived group is read-only, but can still be restored and deleted', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const bob = (await addPlaceholderMember(db, alice, group.id, 'Bob')).userId;
    await setGroupArchived(db, alice, group.id, true);

    // Mutations are refused while archived.
    await expect(renameGroup(db, alice, group.id, 'Nope')).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });
    await expect(renameMember(db, alice, group.id, bob, 'Bobby')).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });
    await expect(addPlaceholderMember(db, alice, group.id, 'Cara')).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });
    await expect(removeMember(db, alice, group.id, bob)).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });

    // Restore reopens it, then edits work again.
    await setGroupArchived(db, alice, group.id, false);
    expect((await renameGroup(db, alice, group.id, 'Weekend')).name).toBe('Weekend');

    // Deleting an archived group is allowed (archive first, delete later).
    await setGroupArchived(db, alice, group.id, true);
    await deleteGroup(db, alice, group.id);
    await expect(getGroup(db, alice, group.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('only the owner can archive', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    const memberId = (await addPlaceholderMember(db, alice, group.id, 'Bob')).userId;
    await expect(setGroupArchived(db, memberId, group.id, true)).rejects.toMatchObject({
      code: 'NOT_OWNER',
    });
  });

  test('renameMember refuses a real account (owner) and a non-member', async () => {
    const db = testDb();
    const group = await createGroup(db, alice, 'Trip');
    // Alice is a real (non-placeholder) account: her name is owned by auth.
    await expect(renameMember(db, alice, group.id, alice, 'Hacker')).rejects.toMatchObject({
      code: 'NOT_PLACEHOLDER',
    });
    const outsider = await seedPerson(db, 'Nate');
    await expect(renameMember(db, alice, group.id, outsider, 'Nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
