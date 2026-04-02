/**
 * 操作日志 / 错误日志工具 - 预留
 */
export function logOperation(module: string, action: string, details?: unknown) {
  console.log(`[OpLog] ${module} ${action}`, details ?? '');
}

export function logError(module: string, error: unknown) {
  console.error(`[ErrorLog] ${module}`, error);
}
