/**
 * 实时事件桥接层
 * 监听 data-refresh 事件，映射为语义化 realtime:* 事件，保持向后兼容
 * 实际 Realtime 订阅已统一到 dataRefreshManager
 */
import { queryClient } from "@/lib/queryClient";
import { subscribeUnifiedRefreshStatus } from "@/services/system/unifiedRefreshHub";

// ============= 事件类型 =============
export type RealtimeEventType =
  | "new_order"
  | "balance_update"
  | "task_update"
  | "chat_message"
  | "rate_update"
  | "audit_update"
  | "activity_gift_update";

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  table?: string;
  eventType?: "INSERT" | "UPDATE" | "DELETE";
  record?: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
}

export type RealtimeConnectionStatus = "connected" | "reconnecting" | "polling" | "disconnected";

type EventCallback = (payload: RealtimeEventPayload) => void;

const CUSTOM_EVENT_PREFIX = "realtime:";

let listeners = new Set<EventCallback>();
let statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
let currentStatus: RealtimeConnectionStatus = "disconnected";
let isInitialized = false;
let dataRefreshUnsubscribe: (() => void) | null = null;
let statusUnsubscribe: (() => void) | null = null;

function setStatus(status: RealtimeConnectionStatus) {
  if (currentStatus === status) return;
  currentStatus = status;
  statusListeners.forEach((cb) => cb(status));
}

function emitEvent(payload: RealtimeEventPayload) {
  window.dispatchEvent(
    new CustomEvent(`${CUSTOM_EVENT_PREFIX}${payload.type}`, { detail: payload })
  );
  window.dispatchEvent(new CustomEvent(`${CUSTOM_EVENT_PREFIX}update`, { detail: payload }));
  listeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      console.error("[RealtimeManager] Listener error:", e);
    }
  });
}

/** 表名 → 语义事件类型映射 */
function mapTableToEventType(table: string): RealtimeEventType | null {
  switch (table) {
    case "orders":
      return "new_order";
    case "balance_change_logs":
      return "balance_update";
    case "tasks":
    case "task_items":
    case "task_item_logs":
      return "task_update";
    case "notifications":
      return "chat_message";
    case "shared_data_store":
      return "rate_update";
    case "audit_records":
      return "audit_update";
    case "activity_gifts":
      return "activity_gift_update";
    default:
      return null;
  }
}

function onDataRefresh(e: Event) {
  const detail = (e as CustomEvent).detail as {
    table?: string;
    operation?: "INSERT" | "UPDATE" | "DELETE" | "*";
    source?: string;
  };
  const table = detail?.table;
  if (!table) return;
  const eventType = mapTableToEventType(table);
  if (!eventType) return;
  emitEvent({
    type: eventType,
    table,
    eventType: detail.operation,
  });
}

/** 初始化实时管理器（登录后调用，需在 initUnifiedRefreshHub 之后） */
export function initRealtimeManager(): () => void {
  if (isInitialized) return () => {};
  isInitialized = true;

  window.addEventListener("data-refresh", onDataRefresh as EventListener);
  dataRefreshUnsubscribe = () => {
    window.removeEventListener("data-refresh", onDataRefresh as EventListener);
  };

  statusUnsubscribe = subscribeUnifiedRefreshStatus((hubStatus) => {
    setStatus(hubStatus === "connected" ? "connected" : "disconnected");
  });

  return () => {
    dataRefreshUnsubscribe?.();
    dataRefreshUnsubscribe = null;
    statusUnsubscribe?.();
    statusUnsubscribe = null;
    isInitialized = false;
    setStatus("disconnected");
  };
}

/** 订阅实时事件 */
export function subscribeRealtimeEvents(callback: EventCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** 订阅指定类型事件 */
export function subscribeToEvent(
  eventType: RealtimeEventType,
  callback: EventCallback
): () => void {
  const wrapped: EventCallback = (payload) => {
    if (payload.type === eventType) callback(payload);
  };
  return subscribeRealtimeEvents(wrapped);
}

/** 订阅连接状态变化 */
export function subscribeConnectionStatus(
  callback: (status: RealtimeConnectionStatus) => void
): () => void {
  statusListeners.add(callback);
  callback(currentStatus);
  return () => statusListeners.delete(callback);
}

/** 获取当前连接状态 */
export function getConnectionStatus(): RealtimeConnectionStatus {
  return currentStatus;
}

/** 手动触发刷新（用于测试或强制同步） */
export function triggerRefresh(eventType: RealtimeEventType = "rate_update") {
  emitEvent({ type: eventType });
  queryClient.invalidateQueries();
}
