/** Legacy types and helpers kept for backward compatibility with older call sites. */
export interface OperationLog {
  id: string;
  timestamp: string;
  operator: string;
  module: string;
  action: string;
  details: string;
  ip?: string;
  oldData?: unknown;
  newData?: unknown;
  targetId?: string;
  targetType?: string;
}

export const addOperationLog = async (
  log: Omit<OperationLog, "id" | "timestamp">,
) => {
  const { logOperationToDb } = await import("@/hooks/useOperationLogs");
  return logOperationToDb(
    log.module,
    log.action,
    log.targetId || null,
    log.oldData,
    log.newData,
    log.details,
  );
};
