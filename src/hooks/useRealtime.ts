/**
 * 实时事件订阅 Hook
 * 组件挂载时订阅，卸载时自动取消
 */
import { useEffect, useRef } from "react";
import {
  subscribeToEvent,
  subscribeRealtimeEvents,
  type RealtimeEventType,
  type RealtimeEventPayload,
} from "@/services/system/realtimeManager";

/** 订阅指定类型事件 */
export function useRealtimeEvent(
  eventType: RealtimeEventType,
  callback: (payload: RealtimeEventPayload) => void
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return subscribeToEvent(eventType, (payload) => {
      callbackRef.current(payload);
    });
  }, [eventType]);
}

/** 订阅所有实时事件 */
export function useRealtimeAll(callback: (payload: RealtimeEventPayload) => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return subscribeRealtimeEvents((payload) => {
      callbackRef.current(payload);
    });
  }, []);
}
