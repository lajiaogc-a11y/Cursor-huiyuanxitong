import { tableGet, tablePost, tablePatch } from './_tableHelpers';

export function getAuditRecordByIdSingle<T>(recordId: string) {
  return tableGet<T | null>(
    'audit_records',
    `select=*&id=eq.${encodeURIComponent(recordId)}&single=true`,
  );
}

export function getOrderByIdSingle<T>(orderId: string) {
  return tableGet<T | null>(
    'orders',
    `select=*&id=eq.${encodeURIComponent(orderId)}&single=true`,
  );
}

export function patchAuditRecordById<T>(recordId: string, body: unknown) {
  return tablePatch<T>(
    'audit_records',
    `id=eq.${encodeURIComponent(recordId)}`,
    body,
  );
}

export function patchDataTableById<T>(table: string, rowId: string, body: unknown) {
  return tablePatch<T>(table, `id=eq.${encodeURIComponent(rowId)}`, body);
}

export function listPermissionChangeLogs(limit: number) {
  return tableGet<unknown[]>(
    'permission_change_logs',
    `select=*&order=changed_at.desc&limit=${limit}`,
  );
}

export function insertPermissionChangeLog(body: unknown) {
  return tablePost<unknown>('permission_change_logs', body);
}

export function listPermissionChangeLogsByRole(role: string) {
  return tableGet<unknown>(
    'permission_change_logs',
    `select=*&target_role=eq.${encodeURIComponent(role)}&order=changed_at.desc&limit=50`,
  );
}

export function getOperationLogsTableRecent<T>(): Promise<T> {
  return tableGet<T>('operation_logs', 'select=*&order=timestamp.desc&limit=5000');
}

export function patchOperationLogById(logId: string, body: unknown) {
  return tablePatch('operation_logs', `id=eq.${encodeURIComponent(logId)}`, body);
}

export function getRolePermissionCanEditRow(
  role: string,
  moduleName: string,
  permissionField: string,
) {
  return tableGet<{ can_edit?: boolean } | null>(
    'role_permissions',
    `select=can_edit&role=eq.${encodeURIComponent(role)}&module_name=eq.${encodeURIComponent(moduleName)}&field_name=eq.${encodeURIComponent(permissionField)}&single=true`,
  );
}

export function createAuditRecord(auditData: Record<string, unknown>) {
  return tablePost<Record<string, unknown>>('audit_records', { data: auditData });
}
