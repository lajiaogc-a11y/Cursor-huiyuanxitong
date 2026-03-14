import { queryClient } from "@/lib/queryClient";
import { isUserTyping } from "@/lib/performanceUtils";

const pendingQueryKeys = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueuedInvalidations() {
  for (const key of pendingQueryKeys) {
    queryClient.invalidateQueries({ queryKey: key.split("::") });
  }
  pendingQueryKeys.clear();
}

export function queueQueryInvalidation(queryKey: string[]) {
  pendingQueryKeys.add(queryKey.join("::"));
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (isUserTyping(1500)) {
      setTimeout(flushQueuedInvalidations, 500);
      return;
    }
    flushQueuedInvalidations();
  }, 100);
}

export function queueQueryInvalidations(queryKeys: string[][]) {
  for (const key of queryKeys) {
    queueQueryInvalidation(key);
  }
}

export function emitLegacyEvents(eventNames: string[]) {
  for (const eventName of eventNames) {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

export function emitDataRefresh(payload: {
  table?: string;
  operation?: "INSERT" | "UPDATE" | "DELETE" | "*";
  source?: "mutation" | "realtime" | "manual";
  domain?: string;
}) {
  window.dispatchEvent(new CustomEvent("data-refresh", { detail: payload }));
}
