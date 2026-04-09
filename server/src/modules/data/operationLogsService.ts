/**
 * 操作日志 Service — 封装 repository 写入，供其他 Controller 调用
 */
import {
  insertOperationLogRepository,
  markOperationLogRestoredRepository,
  type OperationLogRow,
} from './operationLogsRepository.js';

export type { OperationLogRow };

export type InsertOperationLogInput = Omit<
  OperationLogRow,
  'id' | 'timestamp' | 'is_restored' | 'restored_by' | 'restored_at'
> & Partial<Pick<OperationLogRow, 'id' | 'timestamp'>>;

/** 写入一条操作日志（fire-and-forget 模式，不抛出异常） */
export function auditLogService(input: Parameters<typeof insertOperationLogRepository>[0]): Promise<void> {
  return insertOperationLogRepository(input).catch((e) => {
    console.error('[auditLog] insert failed:', e);
  });
}

/** 写入一条操作日志（会抛出异常，由 controller 负责错误处理） */
export async function insertOperationLog(input: Parameters<typeof insertOperationLogRepository>[0]): Promise<void> {
  return insertOperationLogRepository(input);
}

/** 标记操作日志已恢复 */
export async function markOperationLogRestored(
  ...args: Parameters<typeof markOperationLogRestoredRepository>
): ReturnType<typeof markOperationLogRestoredRepository> {
  return markOperationLogRestoredRepository(...args);
}
