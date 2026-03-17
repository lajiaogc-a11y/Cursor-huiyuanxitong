import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type ErrorPayload = {
  error_id: string;
  error_message: string;
  error_stack?: string | null;
  component_stack?: string | null;
  url?: string | null;
  user_agent?: string | null;
  employee_id?: string | null;
  metadata?: Record<string, unknown>;
};

const MAX_REPORTS_PER_SESSION = 20;
const REPORT_THROTTLE_MS = 2000;

function createErrorId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${stamp}-${rand}`;
}

export function useGlobalErrorReporter(employeeId?: string | null) {
  const sentCountRef = useRef(0);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    const report = async (payload: ErrorPayload) => {
      const now = Date.now();
      if (sentCountRef.current >= MAX_REPORTS_PER_SESSION) return;
      if (now - lastSentAtRef.current < REPORT_THROTTLE_MS) return;

      lastSentAtRef.current = now;
      sentCountRef.current += 1;

      try {
        await supabase.from("error_reports" as any).insert(payload);
      } catch {
        // do nothing to avoid secondary crash loops
      }
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = event?.message || "Unhandled window error";
      void report({
        error_id: createErrorId(),
        error_message: String(message).slice(0, 2000),
        error_stack: event?.error?.stack?.slice(0, 5000) || null,
        component_stack: null,
        url: window.location.href,
        user_agent: navigator.userAgent,
        employee_id: employeeId || null,
        metadata: {
          source: "window.onerror",
          pathname: window.location.pathname,
          filename: event?.filename || null,
          lineno: event?.lineno || null,
          colno: event?.colno || null,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason?.message || JSON.stringify(reason || "Unhandled promise rejection");
      const stack = reason?.stack || null;

      void report({
        error_id: createErrorId(),
        error_message: String(message).slice(0, 2000),
        error_stack: stack ? String(stack).slice(0, 5000) : null,
        component_stack: null,
        url: window.location.href,
        user_agent: navigator.userAgent,
        employee_id: employeeId || null,
        metadata: {
          source: "window.unhandledrejection",
          pathname: window.location.pathname,
        },
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [employeeId]);
}
