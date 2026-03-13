/**
 * 统一实时数据更新管理器
 * 基于 Supabase Realtime，将 postgres_changes 映射为语义化事件
 * 支持：自动重连、WebSocket 断开时 fallback 到 polling
 */
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { isUserTyping } from "@/lib/performanceUtils";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

// ============= 常量 =============
const POLLING_INTERVAL_MS = 10000; // WebSocket 断开时轮询间隔 10 秒
const RECONNECT_DELAY_MS = 3000;
const CUSTOM_EVENT_PREFIX = "realtime:";

// ============= 单例状态 =============
let channel: RealtimeChannel | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let listeners = new Set<EventCallback>();
let statusListeners = new Set<(status: RealtimeConnectionStatus) => void>();
let currentStatus: RealtimeConnectionStatus = "disconnected";
let isInitialized = false;

// ============= 状态更新 =============
function setStatus(status: RealtimeConnectionStatus) {
  if (currentStatus === status) return;
  currentStatus = status;
  statusListeners.forEach((cb) => cb(status));
}

// ============= 节流式 Query 失效 =============
const pendingInvalidations = new Set<string>();
let invalidationTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleInvalidation(queryKey: string | string[]) {
  const key = Array.isArray(queryKey) ? queryKey.join(":") : queryKey;
  pendingInvalidations.add(key);
  if (!invalidationTimer) {
    invalidationTimer = setTimeout(() => {
      invalidationTimer = null;
      if (isUserTyping(1500)) {
        // 用户正在输入，延迟 500ms 再执行
        setTimeout(flushInvalidations, 500);
        return;
      }
      flushInvalidations();
    }, 200);
  }
}

function flushInvalidations() {
  pendingInvalidations.forEach((key) => {
    const parts = key.split(":");
    queryClient.invalidateQueries({ queryKey: parts });
  });
  pendingInvalidations.clear();
}

// ============= 事件分发 =============
function emitEvent(payload: RealtimeEventPayload) {
  // 派发 DOM 自定义事件（供非 React 代码使用）
  window.dispatchEvent(
    new CustomEvent(`${CUSTOM_EVENT_PREFIX}${payload.type}`, { detail: payload })
  );
  // 派发通用 update 事件
  window.dispatchEvent(new CustomEvent(`${CUSTOM_EVENT_PREFIX}update`, { detail: payload }));
  // 通知监听器
  listeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      console.error("[RealtimeManager] Listener error:", e);
    }
  });
}

// ============= 表变更 → 语义事件映射 =============
function mapTableChangeToEvent(
  table: string,
  eventType: string,
  newRecord: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null
): RealtimeEventPayload | null {
  const payload: RealtimeEventPayload = {
    type: "new_order", // 默认，下面会覆盖
    table,
    eventType: eventType as "INSERT" | "UPDATE" | "DELETE",
    record: newRecord ?? undefined,
    oldRecord: oldRecord ?? undefined,
  };

  switch (table) {
    case "orders":
      payload.type = "new_order";
      // 关键表刷新统一交给 dataRefreshManager，避免重复失效与双事件触发
      break;
    case "balance_change_logs":
      payload.type = "balance_update";
      scheduleInvalidation(["points-ledger", "merchant-settlement", "dashboard"]);
      break;
    case "points_ledger":
    case "ledger_transactions":
      payload.type = "balance_update";
      // 关键表刷新统一交给 dataRefreshManager，避免重复失效与双事件触发
      break;
    case "tasks":
    case "task_items":
    case "task_item_logs":
      payload.type = "task_update";
      scheduleInvalidation(["task-progress", "open-tasks"]);
      window.dispatchEvent(new CustomEvent("tasks-updated"));
      break;
    case "notifications":
      payload.type = "chat_message";
      scheduleInvalidation(["notifications", "pending-count"]);
      window.dispatchEvent(new CustomEvent("notifications-updated"));
      break;
    case "shared_data_store":
      payload.type = "rate_update";
      scheduleInvalidation(["shared-config", "currency-rates", "fee-settings", "dashboard-trend"]);
      window.dispatchEvent(new CustomEvent("shared-data-updated", { detail: payload }));
      window.dispatchEvent(new CustomEvent("report-cache-invalidate"));
      break;
    case "audit_records":
      payload.type = "audit_update";
      scheduleInvalidation(["audit-records", "audit-pending-count"]);
      window.dispatchEvent(new CustomEvent("audit-records-updated", { detail: payload }));
      break;
    case "activity_gifts":
      payload.type = "activity_gift_update";
      // 关键表刷新统一交给 dataRefreshManager，避免重复失效与双事件触发
      break;
    default:
      return null;
  }
  return payload;
}

// ============= 启动 Polling 回退 =============
function startPolling() {
  if (pollingTimer) return;
  setStatus("polling");
  pollingTimer = setInterval(() => {
    // 触发全局刷新
    queryClient.invalidateQueries();
    emitEvent({ type: "rate_update" });
  }, POLLING_INTERVAL_MS);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

// ============= 建立 Realtime 订阅 =============
function subscribeRealtime() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }

  setStatus("reconnecting");

  channel = supabase
    .channel("realtime-manager-unified")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "orders",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "balance_change_logs" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "balance_change_logs",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "points_ledger" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "points_ledger",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ledger_transactions" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "ledger_transactions",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "tasks",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_items" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "task_items",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "notifications",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shared_data_store" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "shared_data_store",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "audit_records" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "audit_records",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "activity_gifts" },
      (payload) => {
        const p = mapTableChangeToEvent(
          "activity_gifts",
          payload.eventType,
          payload.new as Record<string, unknown>,
          payload.old as Record<string, unknown>
        );
        if (p) emitEvent(p);
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        stopPolling();
        setStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        setStatus("disconnected");
        startPolling();
        // 尝试重连
        setTimeout(subscribeRealtime, RECONNECT_DELAY_MS);
      }
    });
}

// ============= 公开 API =============

/** 初始化实时管理器（登录后调用） */
export function initRealtimeManager(): () => void {
  if (isInitialized) return () => {};
  isInitialized = true;
  subscribeRealtime();
  return () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    stopPolling();
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
