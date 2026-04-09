/**
 * Employees Service - 员工管理
 */
import {
  checkEmployeeUniqueRepository,
  createEmployeeRepository,
  deleteEmployeeRepository,
  forceLogoutEmployeeSessionsRepository,
  getEmployeeRepository,
  listActiveVisibleEmployeesRepository,
  listEmployeeNameHistoryRepository,
  listEmployeesRepository,
  setEmployeePasswordRepository,
  setEmployeeStatusRepository,
  updateEmployeeRepository,
  type EmployeeRow,
} from './repository.js';

export interface EmployeeActor {
  id: string;
  role?: string;
  tenant_id?: string | null;
  is_super_admin?: boolean;
  is_platform_super_admin?: boolean;
}

export interface EmployeeServiceResult<T> {
  success: boolean;
  data?: T;
  error_code?: string;
  message?: string;
}

function isManagerOrAbove(actor: EmployeeActor): boolean {
  return !!(
    actor.is_platform_super_admin ||
    actor.is_super_admin ||
    actor.role === 'admin' ||
    actor.role === 'manager'
  );
}

function isSameTenant(actor: EmployeeActor, target: EmployeeRow): boolean {
  if (actor.is_platform_super_admin) return true;
  return !!actor.tenant_id && actor.tenant_id === target.tenant_id;
}

function canCreateRole(actor: EmployeeActor, role: 'admin' | 'manager' | 'staff'): boolean {
  if (actor.is_platform_super_admin || actor.is_super_admin) return true;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') return role === 'staff';
  return false;
}

function canEditTarget(
  actor: EmployeeActor,
  target: EmployeeRow,
  nextRole?: 'admin' | 'manager' | 'staff'
): boolean {
  if (actor.is_platform_super_admin) return true;
  if (!isSameTenant(actor, target)) return false;
  if (target.is_super_admin) return false;
  if (actor.is_super_admin) return true;
  if (actor.role === 'admin') {
    return target.role !== 'admin';
  }
  if (actor.role === 'manager') {
    return target.role === 'staff' && (!nextRole || nextRole === 'staff');
  }
  return false;
}

function canModifyTarget(actor: EmployeeActor, target: EmployeeRow): boolean {
  if (actor.is_platform_super_admin) return true;
  if (!isSameTenant(actor, target)) return false;
  if (target.is_super_admin) return false;
  if (actor.is_super_admin) return true;
  if (target.role === 'admin') return false;
  return actor.role === 'admin' || actor.role === 'manager';
}

export async function listEmployeesService(tenantId?: string | null) {
  return listEmployeesRepository(tenantId);
}

export async function getEmployeeService(actor: EmployeeActor, id: string): Promise<EmployeeServiceResult<EmployeeRow>> {
  const employee = await getEmployeeRepository(id);
  if (!employee) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (!isSameTenant(actor, employee)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  return { success: true, data: employee };
}

export async function checkEmployeeUniqueService(params: {
  username?: string;
  real_name?: string;
  exclude_id?: string;
  tenant_id?: string | null;
}) {
  return checkEmployeeUniqueRepository({
    username: params.username,
    realName: params.real_name,
    excludeId: params.exclude_id,
    tenantId: params.tenant_id,
  });
}

export async function createEmployeeService(
  actor: EmployeeActor,
  input: {
    tenant_id?: string | null;
    username: string;
    real_name: string;
    role: 'admin' | 'manager' | 'staff';
    password: string;
  }
): Promise<EmployeeServiceResult<EmployeeRow>> {
  if (!isManagerOrAbove(actor)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  const tenantId = actor.is_platform_super_admin
    ? (input.tenant_id ?? null)
    : (actor.tenant_id ?? input.tenant_id ?? null);
  if (!tenantId) {
    return { success: false, error_code: 'TENANT_REQUIRED', message: 'tenant_id required' };
  }
  if (!canCreateRole(actor, input.role)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }

  const unique = await checkEmployeeUniqueRepository({
    username: input.username,
    realName: input.real_name,
    tenantId,
  });
  if (unique.usernameExists) {
    return { success: false, error_code: 'USERNAME_EXISTS', message: 'Username already exists' };
  }
  if (unique.realNameExists) {
    return { success: false, error_code: 'NAME_EXISTS', message: 'Employee name already exists' };
  }

  const employee = await createEmployeeRepository({
    tenantId,
    username: input.username,
    real_name: input.real_name,
    role: input.role,
    password: input.password,
  });
  return { success: true, data: employee };
}

export async function updateEmployeeService(
  actor: EmployeeActor,
  id: string,
  updates: {
    username?: string;
    real_name?: string;
    role?: 'admin' | 'manager' | 'staff';
    password?: string;
    status?: 'active' | 'disabled' | 'pending';
    visible?: boolean;
  },
  changedById?: string,
  changeReason?: string
): Promise<EmployeeServiceResult<EmployeeRow>> {
  const target = await getEmployeeRepository(id);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  const isSelfUpdate = actor.id === id;
  if (isSelfUpdate && !actor.is_platform_super_admin) {
    const touchingRestrictedFields =
      updates.username !== undefined ||
      updates.role !== undefined ||
      updates.status !== undefined ||
      updates.visible !== undefined;
    const canChangeOwnName = !!(actor.is_super_admin || actor.role === 'admin' || actor.role === 'manager');
    if (touchingRestrictedFields || (updates.real_name !== undefined && !canChangeOwnName)) {
      return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
    }
  } else if (!canEditTarget(actor, target, updates.role)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }

  const unique = await checkEmployeeUniqueRepository({
    username: updates.username,
    realName: updates.real_name,
    excludeId: id,
    tenantId: target.tenant_id ?? actor.tenant_id ?? null,
  });
  if (updates.username && unique.usernameExists) {
    return { success: false, error_code: 'USERNAME_EXISTS', message: 'Username already exists' };
  }
  if (updates.real_name && unique.realNameExists) {
    return { success: false, error_code: 'NAME_EXISTS', message: 'Employee name already exists' };
  }

  const employee = await updateEmployeeRepository(id, updates, changedById, changeReason);
  if (!employee) {
    return { success: false, error_code: 'NO_ROWS_UPDATED', message: 'No rows updated' };
  }
  return { success: true, data: employee };
}

export async function getEmployeeNameHistoryService(
  actor: EmployeeActor,
  employeeId: string
): Promise<EmployeeServiceResult<any[]>> {
  const target = await getEmployeeRepository(employeeId);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (!isSameTenant(actor, target)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  const rows = await listEmployeeNameHistoryRepository(employeeId);
  return { success: true, data: rows };
}

export async function deleteEmployeeService(
  actor: EmployeeActor,
  employeeId: string
): Promise<EmployeeServiceResult<void>> {
  const target = await getEmployeeRepository(employeeId);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (!canModifyTarget(actor, target)) {
    return {
      success: false,
      error_code: target.is_super_admin ? 'CANNOT_DELETE_SUPER_ADMIN' : 'NO_PERMISSION',
      message: 'No permission',
    };
  }
  const ok = await deleteEmployeeRepository(employeeId);
  return ok
    ? { success: true }
    : { success: false, error_code: 'DELETE_FAILED', message: 'Delete failed' };
}

export async function toggleEmployeeStatusService(
  actor: EmployeeActor,
  employeeId: string
): Promise<EmployeeServiceResult<{ status: 'active' | 'disabled' }>> {
  const target = await getEmployeeRepository(employeeId);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (!canModifyTarget(actor, target)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  const nextStatus = target.status === 'active' ? 'disabled' : 'active';
  const ok = await setEmployeeStatusRepository(employeeId, nextStatus);
  return ok
    ? { success: true, data: { status: nextStatus } }
    : { success: false, error_code: 'UPDATE_STATUS_FAILED', message: 'Failed to update status' };
}

export async function resetEmployeePasswordService(
  actor: EmployeeActor,
  employeeId: string,
  newPassword: string
): Promise<EmployeeServiceResult<void>> {
  const target = await getEmployeeRepository(employeeId);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (!canModifyTarget(actor, target)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  const ok = await setEmployeePasswordRepository(employeeId, newPassword);
  return ok
    ? { success: true }
    : { success: false, error_code: 'RESET_FAILED', message: 'Failed to reset password' };
}

export async function forceLogoutEmployeeService(
  actor: EmployeeActor,
  employeeId: string,
  reason?: string | null
): Promise<EmployeeServiceResult<void>> {
  const target = await getEmployeeRepository(employeeId);
  if (!target) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' };
  }
  if (actor.id === employeeId) {
    return { success: false, error_code: 'SELF_NOT_ALLOWED', message: 'Cannot force logout current account' };
  }
  if (!canModifyTarget(actor, target)) {
    return { success: false, error_code: 'NO_PERMISSION', message: 'No permission' };
  }
  await forceLogoutEmployeeSessionsRepository(employeeId, reason);
  return { success: true };
}

export async function listActiveVisibleEmployeesService(actor: EmployeeActor, tenantId?: string | null) {
  const effectiveTenantId = actor.is_platform_super_admin
    ? (tenantId ?? null)
    : (actor.tenant_id ?? null);
  return listActiveVisibleEmployeesRepository(effectiveTenantId);
}
