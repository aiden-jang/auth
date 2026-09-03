import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { deletePasskey, listPasskeys, renamePasskey } from '../src/auth/passkeys.js';
import { createDb } from '../src/db/client.js';
import { credentials, users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const db = () => createDb(env as unknown as Env);

let n = 0;
async function seedUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db()
    .insert(users)
    .values({
      id,
      email: `pk-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`,
      passwordHash: 'pbkdf2$1$salt$hash',
      googleId: null,
      displayName: 'Holder',
      emailVerified: true,
    });
  return id;
}

async function seedPasskey(userId: string, label = 'Phone'): Promise<string> {
  const id = `cred_${crypto.randomUUID()}`;
  await db().insert(credentials).values({
    id,
    userId,
    publicKey: 'cHVibGljLWtleQ==',
    counter: 0,
    backedUp: true,
    transports: 'internal',
    label,
  });
  return id;
}

const labelOf = async (id: string) =>
  (await db().select().from(credentials).where(eq(credentials.id, id)).get())?.label;

/*
 * Every one of these takes an id straight from the request body. The owner check is the only thing
 * standing between a guessed or observed credential id and someone else's account, and a passkey
 * is a way in: stripping one is how you push a victim back onto a weaker sign-in.
 */
describe('a passkey belongs to one account', () => {
  it('lists only the ones the asker owns', async () => {
    const mine = await seedUser();
    const theirs = await seedUser();
    const a = await seedPasskey(mine, 'Laptop');
    await seedPasskey(theirs, 'Their phone');

    const listed = await listPasskeys(db(), mine);
    expect(listed.map((p) => p.id)).toEqual([a]);
  });

  it('renames one the asker owns', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine);
    await renamePasskey(db(), mine, id, 'Work laptop');
    expect(await labelOf(id)).toBe('Work laptop');
  });

  it('refuses to rename somebody else’s, even with the exact id', async () => {
    const victim = await seedUser();
    const attacker = await seedUser();
    const id = await seedPasskey(victim, 'Victim phone');

    await expect(renamePasskey(db(), attacker, id, 'pwned')).rejects.toThrow();
    expect(await labelOf(id)).toBe('Victim phone');
  });

  it('refuses to delete somebody else’s, even with the exact id', async () => {
    const victim = await seedUser();
    const attacker = await seedUser();
    const id = await seedPasskey(victim);

    await expect(deletePasskey(db(), attacker, id)).rejects.toThrow();
    expect(await labelOf(id)).toBe('Phone');
  });

  it('deletes one the asker owns', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine);
    await deletePasskey(db(), mine, id);
    expect(await labelOf(id)).toBeUndefined();
  });

  /* Removing the last one is allowed on purpose: the emailed link is always a way back in, and
     refusing would make a lost device impossible to clean up. */
  it('lets the last one go', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine);
    await deletePasskey(db(), mine, id);
    expect(await listPasskeys(db(), mine)).toEqual([]);
  });

  it('reports a passkey that is already gone rather than failing silently', async () => {
    const mine = await seedUser();
    await expect(deletePasskey(db(), mine, 'cred_never_existed')).rejects.toThrow();
    await expect(renamePasskey(db(), mine, 'cred_never_existed', 'x')).rejects.toThrow();
  });
});

describe('naming a passkey', () => {
  it('trims the name it is given', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine);
    await renamePasskey(db(), mine, id, '  Work laptop  ');
    expect(await labelOf(id)).toBe('Work laptop');
  });

  // Bounded, because it is rendered straight into the account page's device list.
  it('caps the name at 40 characters', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine);
    await renamePasskey(db(), mine, id, 'x'.repeat(200));
    expect(await labelOf(id)).toHaveLength(40);
  });

  it('refuses a name that is only whitespace', async () => {
    const mine = await seedUser();
    const id = await seedPasskey(mine, 'Phone');
    await expect(renamePasskey(db(), mine, id, '   ')).rejects.toThrow();
    expect(await labelOf(id)).toBe('Phone');
  });
});
