import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { upsertGoogleUser, type GoogleIdentity } from '../src/auth/google.js';
import { createDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import type { Env } from '../src/env.js';

const db = () => createDb(env as unknown as Env);

let n = 0;
const freshEmail = () => `google-${n++}-${crypto.randomUUID().slice(0, 8)}@test.dev`;

function identity(over: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return { sub: crypto.randomUUID(), email: freshEmail(), emailVerified: true, name: 'G', ...over };
}

async function seedLocalAccount(email: string): Promise<string> {
  const id = crypto.randomUUID();
  await db().insert(users).values({
    id,
    email,
    passwordHash: 'pbkdf2$1$salt$hash',
    googleId: null,
    displayName: 'Owner',
    emailVerified: true,
  });
  return id;
}

describe('signing in through Google', () => {
  it('creates an account the first time somebody arrives', async () => {
    const who = identity();
    const user = await upsertGoogleUser(db(), who);
    expect(user).toMatchObject({ email: who.email, displayName: 'G', emailVerified: true });
  });

  it('returns the same account on the next visit rather than a second one', async () => {
    const who = identity();
    const first = await upsertGoogleUser(db(), who);
    const second = await upsertGoogleUser(db(), { ...who, email: freshEmail(), name: 'Renamed' });
    expect(second?.id).toBe(first?.id);
  });

  /* Google vouching for the address is what lets an existing local account be claimed. */
  it('links a verified address to the account already using it', async () => {
    const email = freshEmail();
    const localId = await seedLocalAccount(email);
    const who = identity({ email, emailVerified: true });

    expect((await upsertGoogleUser(db(), who))?.id).toBe(localId);
    const row = await db().select().from(users).where(eq(users.id, localId)).get();
    expect(row?.googleId).toBe(who.sub);
  });

  /*
   * The takeover this guards. An unverified address is a claim, not proof, so matching one against
   * an existing account would hand that account to whoever made the claim. Refusing to link but
   * signing in anyway is the worst of both: no trail, full access.
   */
  it('refuses an unverified address that collides with an existing account', async () => {
    const email = freshEmail();
    const localId = await seedLocalAccount(email);

    expect(await upsertGoogleUser(db(), identity({ email, emailVerified: false }))).toBeNull();

    const row = await db().select().from(users).where(eq(users.id, localId)).get();
    expect(row?.googleId).toBeNull();
    expect(row?.emailVerified).toBe(true);
  });

  /*
   * Once the binding exists, google_id is the identity and the address is not consulted again.
   * Someone whose address later reads unverified still owns the Google account they linked.
   */
  it('still admits a linked account whose address later reads unverified', async () => {
    const who = identity();
    const first = await upsertGoogleUser(db(), who);
    const again = await upsertGoogleUser(db(), { ...who, emailVerified: false });
    expect(again?.id).toBe(first?.id);
  });

  it('does not open an account on an unverified address either', async () => {
    expect(await upsertGoogleUser(db(), identity({ emailVerified: false }))).toBeNull();
  });
});
