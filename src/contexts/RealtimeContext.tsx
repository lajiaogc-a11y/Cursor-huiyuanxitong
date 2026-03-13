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
} from "@/services/realtimeManager";
import { initDataRefreshManager } from "@/services/dataRefreshManager";

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
    const cleanupRealtime = initRealtimeManager();
    const cleanupRefresh = initDataRefreshManager();
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

  return (
    <RealtimeContext.Provider
      value={{
        status,
        subscribe,
        subscribeAll,
        refresh,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext() {
  const ctx = useContext(RealtimeContext);
  return ctx;
}
