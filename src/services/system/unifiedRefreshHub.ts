import { emitDataRefresh } from '@/services/system/dataConsistencyHub';
import { initDataRefreshManager, notifyDataMutation, type DataRefreshPayload } from '@/services/system/dataRefreshManager';

export type UnifiedRefreshConnectionStatus = 'connected' | 'disconnected';

let status: UnifiedRefreshConnectionStatus = 'disconnected';
const statusListeners = new Set<(next: UnifiedRefreshConnectionStatus) => void>();

function setStatus(next: UnifiedRefreshConnectionStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener(next));
}

export function initUnifiedRefreshHub(): () => void {
  const cleanup = initDataRefreshManager();
  setStatus('connected');
  return () => {
    cleanup();
    setStatus('disconnected');
  };
}

export function getUnifiedRefreshStatus(): UnifiedRefreshConnectionStatus {
  return status;
}

export function subscribeUnifiedRefreshStatus(
  listener: (next: UnifiedRefreshConnectionStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}

export function publishDataMutation(payload: DataRefreshPayload): Promise<void> {
  return notifyDataMutation(payload);
}

export function publishManualRefresh(domain: string) {
  emitDataRefresh({ source: 'manual', domain });
}

