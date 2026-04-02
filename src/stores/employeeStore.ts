// Employee Store - Manage employees via backend API
import {
  checkEmployeeUniqueApi,
  createEmployeeApi,
  deleteEmployeeApi,
  forceLogoutEmployeeApi,
  getEmployeeApi,
  getEmployeeNameHistoryApi,
  listActiveVisibleEmployeesApi,
  listEmployeesApi,
  resetEmployeePasswordApi,
  toggleEmployeeStatusApi,
  updateEmployeeApi,
  type ApiEmployee,
} from '@/api/employees';
import { toast } from 'sonner';

export type AppRole = 'admin' | 'manager' | 'staff';

// Bilingual role labels
export const ROLE_LABELS: Record<AppRole, { zh: string; en: string }> = {
  admin: { zh: '管理员', en: 'Admin' },
  manager: { zh: '主管', en: 'Manager' },
  staff: { zh: '员工', en: 'Staff' },
};

// Helper function to get localized role label
export function getRoleLabel(role: AppRole | null | undefined, lang: 'zh' | 'en' = 'en'): string {
  if (role && role in ROLE_LABELS) {
    return ROLE_LABELS[role as AppRole][lang];
  }
  return lang === 'zh' ? '员工' : 'Staff';
}

export interface Employee {
  id: string;
  username: string;
  real_name: string;
  role: AppRole;
  status: 'active' | 'disabled' | 'pending'; // 与数据库约束一致
  visible: boolean; // 账户可见性，新创建默认为 false
  is_super_admin: boolean; // 总管理员标记
  created_at: string;
  updated_at: string;
}

// Bilingual error messages
export const EMPLOYEE_ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  MISSING_USERNAME: { zh: '用户名不能为空', en: 'Username is required' },
  MISSING_REAL_NAME: { zh: '员工姓名不能为空', en: 'Employee name is required' },
  MISSING_PASSWORD: { zh: '密码不能为空', en: 'Password is required' },
  INVALID_ROLE: { zh: '无效的角色', en: 'Invalid role' },
  USERNAME_EXISTS: { zh: '用户名已存在，请使用其他用户名', en: 'Username already exists, please use a different one' },
  NAME_EXISTS: { zh: '员工姓名已存在，请使用唯一姓名', en: 'Employee name already exists, please use a unique name' },
  DB_ERROR: { zh: '数据库错误', en: 'Database error' },
  INSERT_FAILED: { zh: '添加失败: 未能创建员工记录', en: 'Add failed: Unable to create employee record' },
  ADD_SUCCESS: { zh: '员工添加成功', en: 'Employee added successfully' },
  UPDATE_FAILED: { zh: '更新失败', en: 'Update failed' },
  NO_ROWS_UPDATED: { zh: '更新失败: 未找到匹配的员工或权限不足', en: 'Update failed: Employee not found or insufficient permissions' },
  UPDATE_SUCCESS: { zh: '员工更新成功', en: 'Employee updated successfully' },
  NO_UPDATES: { zh: '没有需要更新的内容', en: 'No updates needed' },
  TENANT_REQUIRED: { zh: '租户信息缺失，请刷新页面后重试', en: 'Tenant info missing, please refresh and retry' },
  SYSTEM_ERROR: { zh: '系统错误，请稍后重试', en: 'System error, please try again later' },
  FETCH_STATUS_FAILED: { zh: '获取员工状态失败', en: 'Failed to get employee status' },
  UPDATE_STATUS_FAILED: { zh: '更新状态失败', en: 'Failed to update status' },
  CANNOT_DELETE_SUPER_ADMIN: { zh: '不能删除超级管理员', en: 'Cannot delete super admin' },
  DELETE_FAILED: { zh: '删除失败', en: 'Delete failed' },
};

// Helper function to get localized error message
export function getEmployeeErrorMessage(code: string, lang: 'zh' | 'en' = 'zh'): string {
  return EMPLOYEE_ERROR_MESSAGES[code]?.[lang] || code;
}

function mapApiEmployee(emp: ApiEmployee): Employee {
  return {
    id: emp.id,
    username: emp.username,
    real_name: emp.real_name,
    role: emp.role as AppRole,
    status: emp.status as 'active' | 'disabled' | 'pending',
    visible: emp.visible ?? false,
    is_super_admin: emp.is_super_admin ?? false,
    created_at: emp.created_at ?? '',
    updated_at: emp.updated_at ?? '',
  };
}

function mapToEmployees(data: ApiEmployee[]): Employee[] {
  return (data || []).map(emp => ({
    ...mapApiEmployee(emp),
  }));
}

function getApiErrorCode(error: any): string | undefined {
  return error?.code || error?.error?.code || error?.response?.data?.error?.code;
}

function getApiErrorMessage(error: any): string | undefined {
  return error?.message || error?.error?.message || error?.response?.data?.error?.message;
}

// 获取所有员工 - 通过后端 API，租户员工可正确看到本租户数据
export async function getEmployees(myTenantId?: string | null): Promise<Employee[]> {
  try {
    const params = myTenantId ? { tenant_id: myTenantId } : undefined;
    const data = await listEmployeesApi(params);
    return mapToEmployees(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error('Error fetching employees:', e);
    return [];
  }
}

// 平台总管理员查看租户时获取该租户员工
export async function getEmployeesForTenant(tenantId: string): Promise<Employee[]> {
  try {
    const data = await listEmployeesApi({ tenant_id: tenantId });
    return mapToEmployees(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error('Error fetching tenant employees:', e);
    return [];
  }
}

// 检查姓名是否唯一
export async function isRealNameUnique(realName: string, excludeId?: string): Promise<boolean> {
  try {
    const result = await checkEmployeeUniqueApi({ real_name: realName, exclude_id: excludeId });
    return !result.realNameExists;
  } catch (error) {
    console.error('Error checking real name:', error);
    return true;
  }
}

// 检查用户名是否唯一
export async function isUsernameUnique(username: string, excludeId?: string): Promise<boolean> {
  try {
    const result = await checkEmployeeUniqueApi({ username, exclude_id: excludeId });
    return !result.usernameExists;
  } catch (error) {
    console.error('Error checking username:', error);
    return true;
  }
}

// 结构化错误返回类型
export interface EmployeeOperationResult {
  success: boolean;
  error_code?: string;
  message?: string;
  data?: Employee;
}

// 添加员工 - 返回结构化错误
export async function addEmployee(employee: {
  username: string;
  real_name: string;
  role: AppRole;
  password: string;
  tenant_id?: string | null;
}): Promise<EmployeeOperationResult> {
  // 校验必填字段
  if (!employee.username || employee.username.trim() === '') {
    return {
      success: false,
      error_code: "MISSING_USERNAME",
    };
  }
  
  if (!employee.real_name || employee.real_name.trim() === '') {
    return {
      success: false,
      error_code: "MISSING_REAL_NAME",
    };
  }
  
  if (!employee.password || employee.password.trim() === '') {
    return {
      success: false,
      error_code: "MISSING_PASSWORD",
    };
  }
  
  // 校验角色合法性
  const validRoles: AppRole[] = ['admin', 'manager', 'staff'];
  if (!validRoles.includes(employee.role)) {
    return {
      success: false,
      error_code: "INVALID_ROLE",
    };
  }

  // 检查用户名唯一
  const usernameUnique = await isUsernameUnique(employee.username);
  if (!usernameUnique) {
    return {
      success: false,
      error_code: "USERNAME_EXISTS",
    };
  }

  // 检查姓名唯一
  const nameUnique = await isRealNameUnique(employee.real_name);
  if (!nameUnique) {
    return {
      success: false,
      error_code: "NAME_EXISTS",
    };
  }

  try {
    const data = await createEmployeeApi({
      username: employee.username.trim(),
      real_name: employee.real_name.trim(),
      role: employee.role,
      password: employee.password,
      ...(employee.tenant_id ? { tenant_id: employee.tenant_id } : {}),
    });
    return {
      success: true,
      error_code: "ADD_SUCCESS",
      data: mapApiEmployee(data),
    };
  } catch (e: any) {
    const code = getApiErrorCode(e);
    return {
      success: false,
      error_code: code || "SYSTEM_ERROR",
      message: getApiErrorMessage(e),
    };
  }
}

// 更新员工 - 返回结构化错误
// 如果更新姓名，会自动记录姓名变更历史
export async function updateEmployee(
  id: string,
  updates: {
    username?: string;
    real_name?: string;
    role?: AppRole;
    password?: string;
    status?: 'active' | 'inactive';
    visible?: boolean;
  },
  changedById?: string,  // 操作人ID
  changeReason?: string  // 变更原因
): Promise<EmployeeOperationResult> {
  try {
    const updateData: Record<string, unknown> = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.real_name !== undefined) updateData.real_name = updates.real_name;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.password && updates.password.trim() !== '') updateData.password = updates.password;
    if (updates.status !== undefined) updateData.status = updates.status === 'inactive' ? 'disabled' : updates.status;
    if (updates.visible !== undefined) updateData.visible = updates.visible;
    if (changeReason !== undefined) updateData.change_reason = changeReason;

    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        error_code: "NO_UPDATES",
      };
    }
    const updatedEmployee = await updateEmployeeApi(id, updateData);

    return {
      success: true,
      error_code: "UPDATE_SUCCESS",
      data: mapApiEmployee(updatedEmployee),
    };
  } catch (e: any) {
    return {
      success: false,
      error_code: getApiErrorCode(e) || "SYSTEM_ERROR",
      message: getApiErrorMessage(e),
    };
  }
}

// 获取员工姓名变更历史
export interface NameHistoryEntry {
  id: string;
  employee_id: string;
  old_name: string;
  new_name: string;
  changed_by: string | null;
  changed_by_name?: string;
  changed_at: string;
  reason: string | null;
}

export async function getEmployeeNameHistory(employeeId: string): Promise<NameHistoryEntry[]> {
  try {
    return await getEmployeeNameHistoryApi(employeeId);
  } catch (error) {
    console.error('Error fetching name history:', error);
    return [];
  }
}

// 删除员工（统一走后端 employees API，由后端处理权限与 FK 清理）
export async function deleteEmployee(
  id: string,
  lang: 'zh' | 'en' = 'zh',
  options?: { isPlatformSuperAdmin?: boolean }
): Promise<{ success: boolean; error_code?: string }> {
  void lang;
  void options;
  try {
    const ok = await deleteEmployeeApi(id);
    return ok ? { success: true } : { success: false, error_code: 'DELETE_FAILED' };
  } catch (error: any) {
    return {
      success: false,
      error_code: getApiErrorCode(error) || 'DELETE_FAILED',
    };
  }
}

// 切换员工状态
export async function toggleEmployeeStatus(id: string, lang: 'zh' | 'en' = 'zh'): Promise<boolean> {
  try {
    const result = await toggleEmployeeStatusApi(id);
    return !!result;
  } catch (error) {
    toast.error(getEmployeeErrorMessage('UPDATE_STATUS_FAILED', lang));
    return false;
  }
}

// 获取员工详情
export async function getEmployeeById(id: string): Promise<Employee | null> {
  try {
    const data = await getEmployeeApi(id);
    return data ? mapApiEmployee(data) : null;
  } catch (error) {
    console.error('Error fetching employee:', error);
    return null;
  }
}

// 获取活跃且可见的员工列表（用于下拉选择）
// 使用安全 RPC 函数避免暴露敏感员工数据
// tenantId: 平台超管查看某租户时传入，否则传 null 使用当前用户租户
export async function getActiveEmployees(tenantId?: string | null): Promise<{ id: string; real_name: string }[]> {
  try {
    return await listActiveVisibleEmployeesApi(tenantId ? { tenant_id: tenantId } : undefined);
  } catch (error) {
    console.error('Error fetching active employees:', error);
    return [];
  }
}

export async function resetEmployeePassword(employeeId: string, newPassword: string): Promise<boolean> {
  try {
    return await resetEmployeePasswordApi(employeeId, newPassword);
  } catch {
    return false;
  }
}

export async function forceLogoutEmployee(employeeId: string, reason?: string): Promise<boolean> {
  try {
    return await forceLogoutEmployeeApi(employeeId, reason);
  } catch {
    return false;
  }
}
