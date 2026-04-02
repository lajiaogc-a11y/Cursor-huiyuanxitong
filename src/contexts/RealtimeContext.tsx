/**
 * 实时数据更新 Context
 * 在 AuthProvider 内使用，登录后自动连接 RealtimeManager
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  initRealtimeManager,
  subscribeRealtimeEvents,
  subscribeConnectionStatus,
  getConnectionStatus,
  triggerRefresh,
  type RealtimeEventType,
  type RealtimeEventPayload,
  type RealtimeConnectionStatus,
} from "@/services/system/realtimeManager";
import { initUnifiedRefreshHub } from "@/services/system/unifiedRefreshHub";

interface RealtimeContextValue {
  /** 连接状态 */
  status: RealtimeConnectionStatus;
  /** 订阅指定类型事件 */
  subscribe: (eventType: RealtimeEventType, callback: (payload: RealtimeEventPayload) => void) => () => void;
  /** 订阅所有事件 */
  subscribeAll: (callback: (payload: RealtimeEventPayload) => void) => () => void;
  /** 手动触发刷新 */
  refresh: (eventType?: RealtimeEventType) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth();
  const [status, setStatus] = useState<RealtimeConnectionStatus>(getConnectionStatus);

  useEffect(() => {
    if (!employee) return;
    const cleanupRefresh = initUnifiedRefreshHub();
    const cleanupRealtime = initRealtimeManager();
    return () => {
      cleanupRealtime();
      cleanupRefresh();
    };
  }, [employee]);

  useEffect(() => {
    return subscribeConnectionStatus(setStatus);
  }, []);

  const subscribe = useCallback(
    (eventType: RealtimeEventType, callback: (payload: RealtimeEventPayload) => void) => {
      return subscribeRealtimeEvents((payload) => {
        if (payload.type === eventType) callback(payload);
      });
    },
    []
  );

  const subscribeAll = useCallback(subscribeRealtimeEvents, []);

  const refresh = useCallback((eventType: RealtimeEventType = "rate_update") => {
    triggerRefresh(eventType);
  }, []);

  const realtimeValue = useMemo(
    () => ({
      status,
      subscribe,
      subscribeAll,
      refresh,
    }),
    [status, subscribe, subscribeAll, refresh],
  );

  return <RealtimeContext.Provider value={realtimeValue}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext() {
  const ctx = useContext(RealtimeContext);
  return ctx;
}
