/**
 * 操作日志 Service — 封装 repository 写入，供其他 Controller 调用
 */
import {
  insertOperationLogRepository,
  type OperationLogRow,
} from './operationLogsRepository.js';

export type { OperationLogRow };

export type InsertOperationLogInput = Omit<
  OperationLogRow,
  'id' | 'timestamp' | 'is_restored' | 'restored_by' | 'restored_at'
> & Partial<Pick<OperationLogRow, 'id' | 'timestamp'>>;

/** 写入一条操作日志（fire-and-forget 模式，不抛出异常，返回 Promise 供调用方选择性 catch） */
export function auditLogService(input: Parameters<typeof insertOperationLogRepository>[0]): Promise<void> {
  return insertOperationLogRepository(input).catch((e) => {
    console.error('[auditLog] insert failed:', e);
  });
}
