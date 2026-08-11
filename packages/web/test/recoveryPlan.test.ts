import { describe, expect, it } from 'vitest';
import { recoveryPlan, recoveryPlanText } from '../src/lib/recoveryPlan';

const user = {
  email: 'aiden@example.com',
  emailVerified: true,
  hasPassword: true,
  hasGoogle: true,
};

describe('recoveryPlan', () => {
  it('uses the account’s real fallback methods', () => {
    expect(recoveryPlan(user, 'lost_method').intro).toContain('Continue with Google');
    expect(recoveryPlan({ ...user, hasGoogle: false }, 'lost_method').intro).toContain('your password');
  });

  it('does not send an unverified account into password recovery', () => {
    const plan = recoveryPlan({ ...user, emailVerified: false }, 'locked_out');
    expect(plan.actionHref).toBeUndefined();
    expect(plan.actionLabel).toBe('Verify email first');
  });

  it('exports a useful checklist without secrets', () => {
    const text = recoveryPlanText(user, recoveryPlan(user, 'locked_out'), new Date('2026-08-11T12:00:00Z'));
    expect(text).toContain('aiden@example.com');
    expect(text).toContain('password, Google, email sign-in link');
    expect(text).toContain('not a key');
    expect(text).not.toContain('token:');
  });
});
