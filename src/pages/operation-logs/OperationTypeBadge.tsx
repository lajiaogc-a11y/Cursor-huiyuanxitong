import { Badge } from "@/components/ui/badge";
import {
  getOperationName,
  normalizeOperationTypeKey,
  type OperationType,
} from "@/services/audit/auditLogService";

const OPERATION_BADGE_COLORS: Record<OperationType, string> = {
  create: "bg-green-500",
  update: "bg-blue-500",
  cancel: "bg-yellow-500",
  restore: "bg-cyan-500",
  delete: "bg-red-500",
  audit: "bg-orange-500",
  reject: "bg-rose-500",
  status_change: "bg-purple-500",
  force_logout: "bg-gray-500",
  batch_delete: "bg-red-600",
  mysql_mysqldump: "bg-indigo-500",
  knowledge_category_patch_delegated: "bg-teal-500",
  shared_data_upsert_delegated: "bg-teal-500",
};

export function OperationTypeBadge({
  type,
  language,
}: {
  type: OperationType;
  language: "zh" | "en";
}) {
  const key = normalizeOperationTypeKey(type) as OperationType;
  return (
    <Badge className={OPERATION_BADGE_COLORS[key] ?? "bg-gray-500"}>
      {getOperationName(type, language)}
    </Badge>
  );
}
