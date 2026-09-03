import { afterEach, describe, expect, it, vi } from 'vitest';

/* The button was offered wherever a passkey *could* exist, which is nearly every device, so people
   who had never made one were asked for a security key. */
describe('whether to offer passkey sign-in', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function load(stored: string | null, storageThrows = false) {
    vi.stubGlobal('window', {
      PublicKeyCredential: function () {},
      localStorage: {
        getItem: () => {
          if (storageThrows) throw new Error('private mode');
          return stored;
        },
        setItem: () => {
          if (storageThrows) throw new Error('private mode');
        },
      },
    });
    return import('../src/lib/passkeys');
  }

  it('does not offer on a device that has never used one', async () => {
    const { passkeyUsedOnThisDevice } = await load(null);
    expect(passkeyUsedOnThisDevice()).toBe(false);
  });

  it('offers once one has been added or used here', async () => {
    const { passkeyUsedOnThisDevice } = await load('1');
    expect(passkeyUsedOnThisDevice()).toBe(true);
  });

  /* Losing the note costs an offer, never access: the password form is untouched. */
  it('stays quiet rather than throwing when storage is unavailable', async () => {
    const { passkeyUsedOnThisDevice, rememberPasskeyOnThisDevice } = await load(null, true);
    expect(passkeyUsedOnThisDevice()).toBe(false);
    expect(() => rememberPasskeyOnThisDevice()).not.toThrow();
  });

  it('treats any other stored value as no', async () => {
    const { passkeyUsedOnThisDevice } = await load('yes');
    expect(passkeyUsedOnThisDevice()).toBe(false);
  });
});
