import { useEffect, useRef } from "react";
import { submitErrorReport, type ErrorReportPayload } from "@/services/observability/errorReportService";
import {
  shouldSuppressGlobalErrorReport,
  safeRejectionMessage,
} from "@/lib/errorReportFilters";
import { isoUtcTimestampDigits14 } from "@/lib/isoTimestampDigits";

const MAX_REPORTS_PER_SESSION = 20;
const REPORT_THROTTLE_MS = 2000;

function createErrorId() {
  const stamp = isoUtcTimestampDigits14();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ERR-${stamp}-${rand}`;
}

export function useGlobalErrorReporter(employeeId?: string | null) {
  const sentCountRef = useRef(0);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    const report = async (payload: ErrorReportPayload) => {
      const now = Date.now();
      if (sentCountRef.current >= MAX_REPORTS_PER_SESSION) return;
      if (now - lastSentAtRef.current < REPORT_THROTTLE_MS) return;

      lastSentAtRef.current = now;
      sentCountRef.current += 1;

      try {
        await submitErrorReport(payload);
      } catch {
        // do nothing to avoid secondary crash loops
      }
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = event?.message || "Unhandled window error";
      if (
        shouldSuppressGlobalErrorReport({
          message: String(message),
          filename: event?.filename ?? null,
          source: "window.onerror",
        })
      ) {
        return;
      }
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
      const message = safeRejectionMessage(reason);
      if (shouldSuppressGlobalErrorReport({ message, source: "window.unhandledrejection" })) {
        return;
      }
      const stack =
        reason && typeof reason === "object" && "stack" in reason && typeof (reason as Error).stack === "string"
          ? (reason as Error).stack
          : null;

      void report({
        error_id: createErrorId(),
        error_message: message,
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
