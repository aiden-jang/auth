import type { RecordSettlementPayload, Settlement, SuggestedPayment } from '@owewell/core';
import { api } from './api';

// Re-export the shared contract so components can keep importing settlement types from here.
export type { RecordSettlementPayload, Settlement, SuggestedPayment } from '@owewell/core';

export const settlementsApi = {
  suggested: (groupId: string): Promise<SuggestedPayment[]> =>
    api
      .get<{ payments: SuggestedPayment[] }>(`/groups/${groupId}/suggested-payments`)
      .then((r) => r.payments),
  list: (groupId: string): Promise<Settlement[]> =>
    api.get<{ settlements: Settlement[] }>(`/groups/${groupId}/settlements`).then((r) => r.settlements),
  record: (groupId: string, body: RecordSettlementPayload): Promise<Settlement> =>
    api.post<{ settlement: Settlement }>(`/groups/${groupId}/settlements`, body).then((r) => r.settlement),
};
