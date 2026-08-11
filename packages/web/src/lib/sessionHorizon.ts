const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionHorizon {
  label: string;
  percentRemaining: number;
  tone: 'calm' | 'soon' | 'expired';
}

/** A human account of a fixed session lifetime, kept separate from rendering for exact edge cases. */
export function sessionHorizon(
  createdAt: string,
  expiresAt: string,
  now = Date.now(),
): SessionHorizon {
  const created = new Date(createdAt).getTime();
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) {
    return { label: 'Expiry unavailable', percentRemaining: 0, tone: 'expired' };
  }

  const remaining = expires - now;
  const percentRemaining = Math.max(0, Math.min(100, Math.round((remaining / (expires - created)) * 100)));
  if (remaining <= 0) return { label: 'Expired', percentRemaining, tone: 'expired' };

  const days = Math.ceil(remaining / DAY_MS);
  return {
    label: days === 1 ? 'Expires today' : days === 2 ? 'Expires tomorrow' : `Expires in ${days} days`,
    percentRemaining,
    tone: days <= 3 ? 'soon' : 'calm',
  };
}
