import { describe, expect, it } from 'vitest';
import { securityCheckup } from '../src/lib/securityCheckup';
import type { SessionInfo } from '../src/lib/api';

const now = new Date('2026-08-11T12:00:00Z').getTime();
const session = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
  id: 'session-1',
  current: true,
  device: 'Personal MacBook',
  location: 'New York, US',
  createdAt: '2026-08-01T12:00:00Z',
  lastSeenAt: '2026-08-11T11:55:00Z',
  ...overrides,
});

describe('securityCheckup', () => {
  it('marks a verified account with one familiar device as strong', () => {
    const result = securityCheckup(
      { emailVerified: true, hasPassword: true, hasGoogle: false },
      [session()],
      now,
    );
    expect(result.score).toBe(100);
    expect(result.label).toBe('Strong');
    expect(result.nextAction).toBeNull();
  });

  it('prioritizes email verification before other fixes', () => {
    const result = securityCheckup(
      { emailVerified: false, hasPassword: false, hasGoogle: false },
      [session()],
      now,
    );
    expect(result.score).toBe(50);
    expect(result.nextAction?.action).toBe('verify_email');
  });

  it('flags stale and unnamed devices for review', () => {
    const result = securityCheckup(
      { emailVerified: true, hasPassword: true, hasGoogle: true },
      [
        session(),
        session({ id: 'old', current: false, device: null, lastSeenAt: '2026-05-01T12:00:00Z' }),
      ],
      now,
    );
    expect(result.score).toBe(75);
    expect(result.checks.find((check) => check.id === 'freshness')?.action).toBe('review_sessions');
  });

  it('does not pretend the device checks passed before sessions load', () => {
    const result = securityCheckup(
      { emailVerified: true, hasPassword: true, hasGoogle: false },
      null,
      now,
    );
    expect(result.score).toBeNull();
    expect(result.label).toBe('Checking');
  });
});
