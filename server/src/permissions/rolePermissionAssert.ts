/**
 * 服务端校验 role_permissions（与前台模块名、field 名一致）
 */
import type { AuthenticatedRequest } from '../middlewares/auth.js';
import { queryOne } from '../database/index.js';

export function resolveStaffPermissionRole(user: NonNullable<AuthenticatedRequest['user']>): string {
  if (user.is_super_admin || user.is_platform_super_admin) return 'super_admin';
  const r = user.role;
  if (r === 'admin' || r === 'manager' || r === 'staff') return r;
  return 'staff';
}

export async function isRolePermissionAllowed(
  role: string,
  moduleName: string,
  fieldName: string,
  kind: 'view' | 'edit' | 'delete',
): Promise<boolean> {
  const row = await queryOne<{ can_view: number; can_edit: number; can_delete: number }>(
    'SELECT can_view, can_edit, can_delete FROM role_permissions WHERE role = ? AND module_name = ? AND field_name = ? LIMIT 1',
    [role, moduleName, fieldName],
  );
  if (!row) return false;
  if (kind === 'view') return !!row.can_view;
  if (kind === 'edit') return !!row.can_edit;
  return !!row.can_delete;
}

/** 数据管理「全站批量删除」：对应 data_management.batch_delete 的「删除」列 */
export async function assertBulkDataDeleteAllowed(user: AuthenticatedRequest['user'] | undefined): Promise<void> {
  if (!user || user.type !== 'employee') {
    const e = new Error('UNAUTHORIZED');
    (e as Error & { statusCode?: number }).statusCode = 401;
    throw e;
  }
  if (user.is_platform_super_admin) return;
  const role = resolveStaffPermissionRole(user);
  const ok = await isRolePermissionAllowed(role, 'data_management', 'batch_delete', 'delete');
  if (!ok) {
    const e = new Error('FORBIDDEN_BATCH_DATA_DELETE');
    (e as Error & { statusCode?: number }).statusCode = 403;
    throw e;
  }
}

/**
 * 单笔删除订单：需 orders.delete_button 或 orders.batch_delete（删除列）任一为真，
 * 与前台「单条删除 / 批量删除」入口一致。
 */
export async function assertOrderDeleteAllowed(user: AuthenticatedRequest['user'] | undefined): Promise<void> {
  if (!user || user.type !== 'employee') {
    const e = new Error('UNAUTHORIZED');
    (e as Error & { statusCode?: number }).statusCode = 401;
    throw e;
  }
  if (user.is_platform_super_admin) return;
  const role = resolveStaffPermissionRole(user);
  const okSingle = await isRolePermissionAllowed(role, 'orders', 'delete_button', 'delete');
  const okBatch = await isRolePermissionAllowed(role, 'orders', 'batch_delete', 'delete');
  if (!okSingle && !okBatch) {
    const e = new Error('FORBIDDEN_ORDER_DELETE');
    (e as Error & { statusCode?: number }).statusCode = 403;
    throw e;
  }
}

/** 表代理删除 error_reports：需 delete_report 或 batch_clear（删除列）任一为真 */
export async function assertErrorReportsDeleteAllowed(user: AuthenticatedRequest['user'] | undefined): Promise<void> {
  if (!user || user.type !== 'employee') {
    const e = new Error('UNAUTHORIZED');
    (e as Error & { statusCode?: number }).statusCode = 401;
    throw e;
  }
  if (user.is_platform_super_admin) return;
  const role = resolveStaffPermissionRole(user);
  const okSingle = await isRolePermissionAllowed(role, 'error_reports', 'delete_report', 'delete');
  const okBatch = await isRolePermissionAllowed(role, 'error_reports', 'batch_clear', 'delete');
  if (!okSingle && !okBatch) {
    const e = new Error('FORBIDDEN_ERROR_REPORTS_DELETE');
    (e as Error & { statusCode?: number }).statusCode = 403;
    throw e;
  }
}
