export const SESSION_CHANGE_CHANNEL = 'aidenjang:session-change';

export function announceSessionChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(SESSION_CHANGE_CHANNEL);
  channel.postMessage(null);
  channel.close();
}
