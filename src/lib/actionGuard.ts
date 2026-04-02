/**
 * 防重复提交工具 — mutex + 节流
 *
 * createActionGuard: 工厂函数，返回一个 guard。调用 guard(action) 时：
 *   1. 如果前一次 action 仍在执行 → 直接返回 null（mutex）
 *   2. 如果距上次调用不足 minIntervalMs → 直接返回 null（节流）
 *   3. 否则执行 action 并返回其结果
 *
 * useActionGuard: React hook，在组件生命周期内保持同一个 guard 实例。
 */
import { useRef } from "react";

export type ActionGuardFn = <T>(action: () => Promise<T>) => Promise<T | null>;

export function createActionGuard(minIntervalMs = 0): ActionGuardFn {
  let busy = false;
  let lastTs = 0;

  return async function guard<T>(action: () => Promise<T>): Promise<T | null> {
    if (busy) return null;
    const now = Date.now();
    if (minIntervalMs > 0 && now - lastTs < minIntervalMs) return null;
    busy = true;
    lastTs = now;
    try {
      return await action();
    } finally {
      busy = false;
    }
  };
}

export function useActionGuard(minIntervalMs = 0): ActionGuardFn {
  const ref = useRef<ActionGuardFn | null>(null);
  if (!ref.current) {
    ref.current = createActionGuard(minIntervalMs);
  }
  return ref.current;
}
