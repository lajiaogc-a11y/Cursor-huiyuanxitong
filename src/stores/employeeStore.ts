// Employee Store - Manage employees via Supabase
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { syncAuthPassword } from '@/services/authPasswordSyncService';

export type AppRole = 'admin' | 'manager' | 'staff';

// Bilingual role labels
export const ROLE_LABELS: Record<AppRole, { zh: string; en: string }> = {
  admin: { zh: '管理员', en: 'Admin' },
  manager: { zh: '主管', en: 'Manager' },
  staff: { zh: '员工', en: 'Staff' },
};

// Helper function to get localized role label
export function getRoleLabel(role: AppRole, lang: 'zh' | 'en' = 'zh'): string {
  return ROLE_LABELS[role]?.[lang] || role;
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

// 映射 RPC 行为 Employee[]
function mapToEmployees(data: any[]): Employee[] {
  return (data || []).map(emp => ({
    id: emp.id,
    username: emp.username,
    real_name: emp.real_name,
    role: emp.role as AppRole,
    status: emp.status as 'active' | 'disabled' | 'pending',
    visible: (emp as any).visible ?? false,
    is_super_admin: (emp as any).is_super_admin ?? false,
    created_at: emp.created_at,
    updated_at: emp.updated_at,
  }));
}

// 获取所有员工（当前租户，受 RLS 约束）
// myTenantId：租户员工的本租户 ID，传入时优先用 RPC 避免 RLS 拦截
export async function getEmployees(myTenantId?: string | null): Promise<Employee[]> {
  if (myTenantId) {
    const { data, error } = await supabase.rpc('get_my_tenant_employees_full');
    if (!error && data) {
      return mapToEmployees(Array.isArray(data) ? data : []);
    }
  }

  const { data, error } = await supabase
    .from('employees')
    .select('id, username, real_name, role, status, visible, is_super_admin, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    if (myTenantId) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_tenant_employees_full');
      if (!rpcError && rpcData) return mapToEmployees(Array.isArray(rpcData) ? rpcData : []);
    }
    console.error('Error fetching employees:', error);
    return [];
  }

  return mapToEmployees(data);
}

// 平台总管理员查看租户时获取该租户员工
export async function getEmployeesForTenant(tenantId: string): Promise<Employee[]> {
  const { data, error } = await supabase.rpc('platform_get_tenant_employees_full', {
    p_tenant_id: tenantId,
  });
  if (error) {
    console.error('Error fetching tenant employees:', error);
    return [];
  }
  return mapToEmployees(Array.isArray(data) ? data : []);
}

// 检查姓名是否唯一
export async function isRealNameUnique(realName: string, excludeId?: string): Promise<boolean> {
  let query = supabase
    .from('employees')
    .select('id')
    .eq('real_name', realName);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking real name:', error);
    // 如果查询出错，假设名称可用以允许更新继续
    return true;
  }

  return data.length === 0;
}

// 检查用户名是否唯一
export async function isUsernameUnique(username: string, excludeId?: string): Promise<boolean> {
  let query = supabase
    .from('employees')
    .select('id')
    .eq('username', username);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error checking username:', error);
    // 如果查询出错，假设用户名可用以允许更新继续
    return true;
  }

  return data.length === 0;
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
    // 直接插入；数据库触发器会把明文密码自动转成 bcrypt
    // 不使用 .single()，避免 RLS 相关错误
    const { data, error } = await supabase
      .from('employees')
      .insert({
        username: employee.username.trim(),
        real_name: employee.real_name.trim(),
        role: employee.role,
        password_hash: employee.password, // 会被数据库函数加密
        status: 'active',
      })
      .select();

    if (error) {
      console.error('Error adding employee:', error);
      return {
        success: false,
        error_code: "DB_ERROR",
      };
    }

    // 检查是否成功插入
    if (!data || data.length === 0) {
      return {
        success: false,
        error_code: "INSERT_FAILED",
      };
    }

    const newEmployee = data[0];

    return {
      success: true,
      error_code: "ADD_SUCCESS",
      data: {
        id: newEmployee.id,
        username: newEmployee.username,
        real_name: newEmployee.real_name,
        role: newEmployee.role as AppRole,
        status: newEmployee.status as 'active' | 'disabled' | 'pending',
        visible: (newEmployee as any).visible ?? false,
        is_super_admin: (newEmployee as any).is_super_admin ?? false,
        created_at: newEmployee.created_at,
        updated_at: newEmployee.updated_at,
      }
    };
  } catch (e: any) {
    console.error('Exception adding employee:', e);
    return {
      success: false,
      error_code: "SYSTEM_ERROR",
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
  // 如果更新用户名，检查唯一性
  if (updates.username) {
    const usernameUnique = await isUsernameUnique(updates.username, id);
    if (!usernameUnique) {
      return {
        success: false,
        error_code: "USERNAME_EXISTS",
      };
    }
  }

  // 如果更新姓名，检查唯一性
  if (updates.real_name) {
    const nameUnique = await isRealNameUnique(updates.real_name, id);
    if (!nameUnique) {
      return {
        success: false,
        error_code: "NAME_EXISTS",
      };
    }
  }

  try {
    // 如果要更新姓名，先获取旧姓名用于记录历史
    let oldName: string | null = null;
    if (updates.real_name !== undefined) {
      const { data: currentData, error: fetchError } = await supabase
        .from('employees')
        .select('real_name')
        .eq('id', id)
        .single();
      
      if (!fetchError && currentData) {
        oldName = currentData.real_name;
      }
    }

    const updateData: Record<string, unknown> = {};
    // 使用 undefined 检查而不是 truthy 检查，确保空字符串也能正确处理
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.real_name !== undefined) updateData.real_name = updates.real_name;
    if (updates.role !== undefined) updateData.role = updates.role;
    const hasPasswordUpdate = updates.password && updates.password.trim() !== '';
    if (hasPasswordUpdate) updateData.password_hash = updates.password;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.visible !== undefined) updateData.visible = updates.visible;

    // 如果没有任何需要更新的字段
    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        error_code: "NO_UPDATES",
      };
    }

    console.log('Updating employee with data:', updateData);

    // 不使用 .single()，避免 RLS 导致的 "Cannot coerce to single object" 错误
    const { data, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating employee:', error);
      return {
        success: false,
        error_code: "UPDATE_FAILED",
      };
    }

    // 检查是否有更新的行
    if (!data || data.length === 0) {
      return {
        success: false,
        error_code: "NO_ROWS_UPDATED",
      };
    }

    const updatedEmployee = data[0];

    // 如果姓名发生变化，记录变更历史
    if (oldName && updates.real_name && oldName !== updates.real_name) {
      try {
        await supabase
          .from('employee_name_history')
          .insert({
            employee_id: id,
            old_name: oldName,
            new_name: updates.real_name,
            changed_by: changedById || null,
            reason: changeReason || null,
          });
        console.log('Name change history recorded:', { oldName, newName: updates.real_name });
      } catch (historyError) {
        // 即使记录历史失败也不影响主要更新
        console.error('Failed to record name change history:', historyError);
      }
    }

    // 如果更新了密码，同步到 Auth 系统
    if (hasPasswordUpdate && updates.password) {
      try {
        await syncAuthPassword(updatedEmployee.username, updates.password);
      } catch (syncErr) {
        console.warn('Auth password sync failed:', syncErr);
      }
    }

    return {
      success: true,
      error_code: "UPDATE_SUCCESS",
      data: {
        id: updatedEmployee.id,
        username: updatedEmployee.username,
        real_name: updatedEmployee.real_name,
        role: updatedEmployee.role as AppRole,
        status: updatedEmployee.status as 'active' | 'disabled' | 'pending',
        visible: (updatedEmployee as any).visible ?? false,
        is_super_admin: (updatedEmployee as any).is_super_admin ?? false,
        created_at: updatedEmployee.created_at,
        updated_at: updatedEmployee.updated_at,
      }
    };
  } catch (e: any) {
    return {
      success: false,
      error_code: "SYSTEM_ERROR",
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
  const { data, error } = await supabase
    .from('employee_name_history')
    .select('*')
    .eq('employee_id', employeeId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.error('Error fetching name history:', error);
    return [];
  }

  // 获取操作人姓名
  const historyWithNames = await Promise.all(
    (data || []).map(async (entry) => {
      let changedByName = '-';
      if (entry.changed_by) {
        const { data: empData } = await supabase
          .from('employees')
          .select('real_name')
          .eq('id', entry.changed_by)
          .single();
        if (empData) {
          changedByName = empData.real_name;
        }
      }
      return {
        ...entry,
        changed_by_name: changedByName,
      };
    })
  );

  return historyWithNames;
}

// 删除员工（需 admin 权限；平台总管理员可删除任意员工含租户总管理员）
// isPlatformSuperAdmin: 平台总管理员删除时传 true，使用 platform_delete_employee 完整处理 FK
export async function deleteEmployee(
  id: string,
  lang: 'zh' | 'en' = 'zh',
  options?: { isPlatformSuperAdmin?: boolean }
): Promise<{ success: boolean; error_code?: string }> {
  const { data: emp, error: fetchError } = await supabase
    .from('employees')
    .select('id, is_super_admin')
    .eq('id', id)
    .single();

  if (fetchError || !emp) {
    return { success: false, error_code: 'EMPLOYEE_NOT_FOUND' };
  }

  // 目标为总管理员 或 平台总管理员删除任意员工时，使用平台 RPC（完整处理 FK）
  if ((emp as any).is_super_admin || options?.isPlatformSuperAdmin) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('platform_delete_employee', {
      p_employee_id: id,
    });
    if (rpcError) {
      console.error('Error platform_delete_employee:', rpcError);
      return { success: false, error_code: 'DELETE_FAILED' };
    }
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row?.success) return { success: true };
    return { success: false, error_code: row?.error_code === 'NO_PERMISSION' ? 'CANNOT_DELETE_SUPER_ADMIN' : (row?.error_code || 'DELETE_FAILED') };
  }

  // 租户管理员删除本租户普通员工：使用 tenant_delete_employee（完整处理 FK，避免直接 delete 违反约束）
  const { data: tenantRpcData, error: tenantRpcError } = await supabase.rpc('tenant_delete_employee', {
    p_employee_id: id,
  });
  if (tenantRpcError) {
    console.error('Error tenant_delete_employee:', tenantRpcError);
    return { success: false, error_code: 'DELETE_FAILED' };
  }
  const tenantRow = Array.isArray(tenantRpcData) ? tenantRpcData[0] : tenantRpcData;
  if (tenantRow?.success) return { success: true };
  return {
    success: false,
    error_code: tenantRow?.error_code === 'CANNOT_DELETE_SUPER_ADMIN' ? 'CANNOT_DELETE_SUPER_ADMIN' : (tenantRow?.error_code === 'NO_PERMISSION' ? 'NO_PERMISSION' : 'DELETE_FAILED'),
  };
}

// 切换员工状态
export async function toggleEmployeeStatus(id: string, lang: 'zh' | 'en' = 'zh'): Promise<boolean> {
  // 先获取当前状态
  const { data: current, error: fetchError } = await supabase
    .from('employees')
    .select('status')
    .eq('id', id)
    .single();

  if (fetchError) {
    toast.error(getEmployeeErrorMessage('FETCH_STATUS_FAILED', lang));
    return false;
  }

  const newStatus = current.status === 'active' ? 'disabled' : 'active';

  const { error } = await supabase
    .from('employees')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) {
    toast.error(getEmployeeErrorMessage('UPDATE_STATUS_FAILED', lang));
    return false;
  }

  return true;
}

// 获取员工详情
export async function getEmployeeById(id: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, username, real_name, role, status, visible, is_super_admin, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching employee:', error);
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    real_name: data.real_name,
    role: data.role as AppRole,
    status: data.status as 'active' | 'disabled' | 'pending',
    visible: (data as any).visible ?? false,
    is_super_admin: (data as any).is_super_admin ?? false,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// 获取活跃且可见的员工列表（用于下拉选择）
// 使用安全 RPC 函数避免暴露敏感员工数据
// tenantId: 平台超管查看某租户时传入，否则传 null 使用当前用户租户
export async function getActiveEmployees(tenantId?: string | null): Promise<{ id: string; real_name: string }[]> {
  // 首先尝试使用安全 RPC 函数（活跃+可见，按租户过滤）
  const { data: rpcData, error: rpcError } = await (supabase
    .rpc as any)('get_active_visible_employees_safe', { p_tenant_id: tenantId || null });

  if (!rpcError && rpcData) {
    return rpcData;
  }

  // 回退到直接查询（RLS 会按租户过滤）
  const { data, error } = await supabase
    .from('employees')
    .select('id, real_name')
    .eq('status', 'active')
    .eq('visible', true)  // 只返回可见员工
    .order('real_name');

  if (error) {
    console.error('Error fetching active employees:', error);
    return [];
  }

  return data || [];
}
