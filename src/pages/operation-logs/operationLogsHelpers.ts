import { HIDDEN_LOG_FIELDS } from "@/lib/fieldLabelMap";
import {
  normalizeOperationTypeKey,
  type OperationType,
} from "@/services/audit/auditLogService";

export type OperationLogsTab = "logs" | "errors" | "member";

export function operationLogsTabFromSearch(sp: URLSearchParams): OperationLogsTab {
  const v = sp.get("tab");
  if (v === "errors" || v === "member") return v;
  return "logs";
}

export const OPERATION_LOGS_PAGE_SIZE = 50;

export function getLogAccent(
  type: OperationType,
): "default" | "success" | "danger" | "info" {
  switch (normalizeOperationTypeKey(type) as OperationType) {
    case "delete":
    case "batch_delete":
    case "cancel":
    case "reject":
      return "danger";
    case "create":
      return "success";
    case "update":
    case "status_change":
    case "knowledge_category_patch_delegated":
    case "shared_data_upsert_delegated":
      return "info";
    case "mysql_mysqldump":
      return "info";
    default:
      return "default";
  }
}

export function filterHiddenFields(data: unknown): [string, unknown][] {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data as Record<string, unknown>).filter(
    ([key]) => !HIDDEN_LOG_FIELDS.has(key) && !key.startsWith("__"),
  );
}
