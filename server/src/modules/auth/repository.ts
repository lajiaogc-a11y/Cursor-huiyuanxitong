/**
 * Auth Repository - 认证相关 RPC 与数据访问
 */
import { supabaseAdmin } from '../../database/index.js';

export interface VerifyEmployeeResult {
  employee_id: string;
  username: string;
  real_name: string;
  role: string;
  status: string;
  is_super_admin: boolean;
  is_platform_super_admin?: boolean;
  tenant_id?: string | null;
}

export async function verifyEmployeeLoginRepository(
  username: string,
  password: string
): Promise<{ data: VerifyEmployeeResult[] | null; error: Error | null }> {
  const { data, error } = await supabaseAdmin.rpc('verify_employee_login_detailed', {
    p_username: username.trim(),
    p_password: password,
  });
  if (error) {
    console.error('[Auth] verify_employee_login_detailed error:', error.message, error.code);
    return { data: null, error };
  }
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  return { data: arr, error: null };
}

export async function checkEmployeeLoginLockRepository(
  username: string
): Promise<{ is_locked: boolean; remaining_seconds: number }> {
  const { data, error } = await supabaseAdmin.rpc('check_employee_login_lock', {
    p_username: username.trim(),
  });
  if (error) return { is_locked: false, remaining_seconds: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    is_locked: Boolean(row?.is_locked),
    remaining_seconds: Number(row?.remaining_seconds ?? 0),
  };
}

export async function getMaintenanceModeStatusRepository(
  tenantId?: string | null
): Promise<{ effectiveEnabled: boolean; scope: string }> {
  const { data, error } = await supabaseAdmin.rpc('get_maintenance_mode_status' as never, {
    p_tenant_id: tenantId ?? null,
  } as never);
  if (error) return { effectiveEnabled: false, scope: 'none' };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    effectiveEnabled: Boolean(row?.effective_enabled),
    scope: row?.scope ?? 'none',
  };
}

export async function logEmployeeLoginRepository(
  employeeId: string,
  ipAddress: string | null,
  userAgent: string,
  success: boolean,
  failureReason?: string | null
): Promise<void> {
  const rpcResult = await supabaseAdmin.rpc('log_employee_login', {
    p_employee_id: employeeId,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
    p_success: success,
    p_failure_reason: failureReason ?? null,
  });
  if (rpcResult.error) {
    console.warn('[Auth] log_employee_login RPC failed, falling back to direct insert:', rpcResult.error.message);
    const { error: insertErr } = await supabaseAdmin.from('employee_login_logs').insert({
      employee_id: employeeId,
      ip_address: ipAddress,
      user_agent: userAgent,
      success,
      failure_reason: failureReason ?? null,
    });
    if (insertErr) console.error('[Auth] Direct insert login log failed:', insertErr.message);
  }
}

export async function clearEmployeeLoginFailuresRepository(employeeId: string): Promise<void> {
  await supabaseAdmin.rpc('clear_employee_login_failures', {
    p_employee_id: employeeId,
  });
}

export async function signupEmployeeRepository(params: {
  username: string;
  password: string;
  realName: string;
  invitationCode?: string | null;
}): Promise<{ success: boolean; error_code?: string; assigned_status?: string }> {
  const { data, error } = await supabaseAdmin.rpc('signup_employee', {
    p_username: params.username.trim(),
    p_password: params.password,
    p_real_name: params.realName.trim(),
    p_invitation_code: params.invitationCode ?? null,
  });
  if (error) return { success: false, error_code: 'RPC_ERROR' };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: Boolean(row?.success),
    error_code: row?.error_code,
    assigned_status: row?.assigned_status,
  };
}

export async function getEmployeeByIdRepository(employeeId: string): Promise<VerifyEmployeeResult | null> {
  // 优先使用 RPC（SECURITY DEFINER，更可靠），回退到直接查询
  try {
    const { data, error } = await supabaseAdmin.rpc('get_employee_by_id', {
      p_employee_id: employeeId,
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        return {
          employee_id: (row as Record<string, unknown>).employee_id as string,
          username: (row as Record<string, unknown>).username as string,
          real_name: (row as Record<string, unknown>).real_name as string,
          role: (row as Record<string, unknown>).role as string,
          status: (row as Record<string, unknown>).status as string,
          is_super_admin: Boolean((row as Record<string, unknown>).is_super_admin),
          is_platform_super_admin: (row as Record<string, unknown>).is_platform_super_admin as boolean | undefined,
          tenant_id: (row as Record<string, unknown>).tenant_id as string | null,
        };
      }
    }
  } catch (e) {
    // RPC 可能不存在，回退到直接查询
  }
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, username, real_name, role, status, is_super_admin, tenant_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('[Auth] getEmployeeById error:', error.message, 'employeeId:', employeeId);
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    employee_id: row.id as string,
    username: row.username as string,
    real_name: row.real_name as string,
    role: row.role as string,
    status: row.status as string,
    is_super_admin: Boolean(row.is_super_admin),
    is_platform_super_admin: (row as { is_platform_super_admin?: boolean }).is_platform_super_admin,
    tenant_id: row.tenant_id as string | null,
  };
}
