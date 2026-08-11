import { describe, expect, it } from 'vitest';
import { sessionHorizon } from '../src/lib/sessionHorizon';

const day = 24 * 60 * 60 * 1000;
const iso = (time: number) => new Date(time).toISOString();

describe('sessionHorizon', () => {
  it('shows the remaining share of a session lifetime', () => {
    const now = Date.UTC(2026, 7, 11, 12);
    expect(sessionHorizon(iso(now - 5 * day), iso(now + 5 * day), now)).toEqual({
      label: 'Expires in 5 days',
      percentRemaining: 50,
      tone: 'calm',
    });
  });

  it('calls out sessions nearing expiry', () => {
    const now = Date.UTC(2026, 7, 11, 12);
    expect(sessionHorizon(iso(now - 8 * day), iso(now + day), now)).toMatchObject({
      label: 'Expires today',
      tone: 'soon',
    });
  });

  it('clamps expired and malformed lifetimes safely', () => {
    const now = Date.UTC(2026, 7, 11, 12);
    expect(sessionHorizon(iso(now - 2 * day), iso(now - day), now)).toMatchObject({
      label: 'Expired',
      percentRemaining: 0,
    });
    expect(sessionHorizon('nope', 'still nope', now).label).toBe('Expiry unavailable');
  });
});
