import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { AuthUser } from '@aidenjang/auth-client';
import type { DB } from './db/client.js';
import { groupMembers, people } from './db/schema.js';

export interface Person {
  id: string;
  displayName: string;
  isPlaceholder: boolean;
}

/**
 * Resolve a shared-auth account to its owewell-local person, creating it on first sight.
 * Keeps displayName fresh from auth. owewell keys all its data on person.id, never the auth id.
 */
export async function getOrCreatePerson(db: DB, authUser: AuthUser): Promise<Person> {
  const existing = await db
    .select({ id: people.id, displayName: people.displayName, isPlaceholder: people.isPlaceholder })
    .from(people)
    .where(eq(people.authUserId, authUser.id))
    .get();
  if (existing) {
    if (existing.displayName !== authUser.displayName) {
      await db.update(people).set({ displayName: authUser.displayName }).where(eq(people.id, existing.id));
      existing.displayName = authUser.displayName;
    }
    return existing;
  }
  const person: Person = {
    id: crypto.randomUUID(),
    displayName: authUser.displayName,
    isPlaceholder: false,
  };
  await db.insert(people).values({ id: person.id, authUserId: authUser.id, displayName: person.displayName });
  return person;
}

/** Delete placeholder people who no longer belong to any group (orphaned by a removal/delete). */
export async function pruneOrphanPlaceholders(db: DB): Promise<void> {
  const stillMembers = await db.selectDistinct({ personId: groupMembers.personId }).from(groupMembers);
  const keepIds = stillMembers.map((m) => m.personId);
  const base = and(eq(people.isPlaceholder, true));
  await db.delete(people).where(keepIds.length ? and(base, notInArray(people.id, keepIds)) : and(base, isNull(people.authUserId)));
}
