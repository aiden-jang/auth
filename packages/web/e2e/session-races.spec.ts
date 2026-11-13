import { expect, test } from './fixtures';

test('a stale device refresh cannot undo a completed sign-out or rename', async ({ page }) => {
  const now = new Date().toISOString();
  const current = {
    id: 'current',
    current: true,
    device: 'This laptop',
    createdAt: now,
    lastSeenAt: now,
    expiresAt: '2099-01-01T00:00:00Z',
    location: null,
  };
  const other = { ...current, id: 'other', current: false, device: 'Other laptop' };
  let sessions = [current, other];
  let delayed: { ready: () => void; release: Promise<void> } | null = null;
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      json: {
        user: {
          id: 'review',
          email: 'preview@example.test',
          displayName: 'Preview',
          emailVerified: true,
          hasPassword: true,
          hasGoogle: false,
        },
        sudoUntil: null,
      },
    }),
  );
  await page.route('**/auth/passkeys', (route) => route.fulfill({ json: { passkeys: [] } }));
  await page.route('**/auth/sessions', async (route) => {
    const snapshot = sessions.map((session) => ({ ...session }));
    if (delayed) {
      const gate = delayed;
      delayed = null;
      gate.ready();
      await gate.release;
    }
    await route.fulfill({ json: { sessions: snapshot } });
  });
  await page.route('**/auth/sessions/revoke', (route) => {
    sessions = sessions.filter((session) => session.id !== 'other');
    return route.fulfill({ json: { ok: true } });
  });
  await page.route('**/auth/sessions/rename', (route) => {
    sessions = sessions.map((session) => ({ ...session, device: 'Personal laptop' }));
    return route.fulfill({ json: { session: { id: 'current', device: 'Personal laptop' } } });
  });
  await page.goto('/account#active-sessions');
  const section = page.getByRole('region', { name: 'Active sessions' });
  await expect(section.getByRole('button', { name: /Other laptop/ })).toBeVisible();
  for (const action of ['sign-out', 'rename']) {
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    delayed = {
      ready: started,
      release: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    try {
      await section.getByRole('button', { name: 'Refresh', exact: true }).click();
      await ready;
      if (action === 'sign-out') {
        await section.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(section.getByRole('button', { name: /Other laptop/ })).toBeHidden();
      } else {
        await section.getByRole('button', { name: /This laptop/ }).click();
        await section.getByRole('button', { name: 'Rename device', exact: true }).click();
        await section.getByLabel('Device name').fill('Personal laptop');
        await section.getByRole('button', { name: 'Save name', exact: true }).click();
        await expect(section.getByRole('button', { name: /Personal laptop/ })).toBeVisible();
      }
      release();
      await expect(section.getByRole('button', { name: 'Refreshing…', exact: true })).toBeHidden();
      await expect(section.getByRole('button', { name: /Other laptop/ })).toBeHidden();
      if (action === 'rename')
        await expect(section.getByRole('button', { name: /Personal laptop/ })).toBeVisible();
      await expect(section.getByRole('button', { name: 'Up to date', exact: true })).toBeHidden();
    } finally {
      release();
    }
  }
});
