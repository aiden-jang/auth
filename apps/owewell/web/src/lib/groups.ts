import type { Balance, GroupDetail, GroupMember, GroupSummary } from '@owewell/core';
import { api } from './api';

// Re-export the shared contract so components can keep importing group types from here.
export type { Balance, GroupDetail, GroupMember, GroupRole, GroupSummary } from '@owewell/core';

export const groupsApi = {
  list: (): Promise<GroupSummary[]> =>
    api.get<{ groups: GroupSummary[] }>('/groups').then((r) => r.groups),
  create: (name: string): Promise<GroupDetail> =>
    api.post<{ group: GroupDetail }>('/groups', { name }).then((r) => r.group),
  get: (id: string): Promise<GroupDetail> =>
    api.get<{ group: GroupDetail }>(`/groups/${id}`).then((r) => r.group),
  // Add a name-only placeholder (someone not on owewell yet). Real accounts join via an
  // invite link instead, since owewell can't look up other people's accounts by email.
  addPlaceholder: (id: string, name: string): Promise<GroupMember> =>
    api.post<{ member: GroupMember }>(`/groups/${id}/members`, { name }).then((r) => r.member),
  balances: (id: string): Promise<Balance[]> =>
    api.get<{ balances: Balance[] }>(`/groups/${id}/balances`).then((r) => r.balances),
  rename: (id: string, name: string): Promise<GroupDetail> =>
    api.patch<{ group: GroupDetail }>(`/groups/${id}`, { name }).then((r) => r.group),
  remove: (id: string): Promise<void> => api.del(`/groups/${id}`).then(() => undefined),
  removeMember: (id: string, userId: string): Promise<void> =>
    api.del(`/groups/${id}/members/${userId}`).then(() => undefined),
};
