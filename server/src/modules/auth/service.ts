/**
 * Auth Service - 认证业务逻辑，使用 JWT 替代 Supabase Auth
 */
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { verifyToken } from './jwt.js';
import type { LoginRequest, LoginResponse, AuthUser, JwtPayload } from './types.js';
import {
  verifyEmployeeLoginRepository,
  checkEmployeeLoginLockRepository,
  getMaintenanceModeStatusRepository,
  logEmployeeLoginRepository,
  clearEmployeeLoginFailuresRepository,
  signupEmployeeRepository,
  getEmployeeByIdRepository,
} from './repository.js';

const JWT_EXPIRES_IN = '7d';

function toAuthUser(row: {
  employee_id: string;
  username: string;
  real_name: string;
  role: string;
  status: string;
  is_super_admin: boolean;
  is_platform_super_admin?: boolean;
  tenant_id?: string | null;
}): AuthUser {
  return {
    id: row.employee_id,
    username: row.username,
    real_name: row.real_name,
    role: row.role,
    status: row.status,
    is_super_admin: row.is_super_admin ?? false,
    is_platform_super_admin: row.is_platform_super_admin ?? row.is_super_admin ?? false,
    tenant_id: row.tenant_id ?? null,
  };
}

export async function loginService(
  params: LoginRequest,
  clientIp?: string | null,
  userAgent?: string
): Promise<LoginResponse> {
  const username = params.username?.trim();
  if (!username || !params.password) {
    return { success: false, error: '用户名和密码不能为空' };
  }

  // 1. 检查登录锁定（可选，RPC 不存在时跳过）
  let lock = { is_locked: false, remaining_seconds: 0 };
  try {
    lock = await checkEmployeeLoginLockRepository(username);
  } catch (_) {
    // RPC 可能不存在，跳过锁定检查
  }
  if (lock.is_locked) {
    const minutes = Math.max(1, Math.ceil((lock.remaining_seconds ?? 0) / 60));
    return { success: false, error: `账号已临时锁定，请${minutes}分钟后重试` };
  }

  // 2. 验证账号密码
  const { data: verifyData, error: verifyError } = await verifyEmployeeLoginRepository(username, params.password);
  if (verifyError) {
    const msg = (verifyError.message || '').toLowerCase();
    if (msg.includes('permission') || msg.includes('denied') || msg.includes('jwt') || msg.includes('role') || msg.includes('rpc') || msg.includes('function')) {
      return { success: false, error: '后端配置错误：请在 server/.env 中配置正确的 SUPABASE_SERVICE_ROLE_KEY（从 Supabase 控制台 → Settings → API → service_role 获取），详见 docs/LOCAL_SETUP.md' };
    }
    return { success: false, error: '系统繁忙，请稍后重试' };
  }
  if (!verifyData || verifyData.length === 0) {
    return { success: false, error: '验证失败，请稍后重试' };
  }

  const result = verifyData[0];
  const errorCode = (result as { error_code?: string }).error_code;
  if (errorCode === 'USER_NOT_FOUND') {
    return { success: false, error: '账号不存在' };
  }
  if (errorCode === 'WRONG_PASSWORD') {
    return { success: false, error: '密码错误' };
  }
  if (errorCode === 'ACCOUNT_DISABLED') {
    return { success: false, error: '账号已被禁用，请联系管理员' };
  }

  const emp = result as {
    employee_id: string;
    username: string;
    real_name: string;
    role: string;
    status: string;
    is_super_admin: boolean;
    is_platform_super_admin?: boolean;
    tenant_id?: string | null;
  };

  if (emp.status === 'pending') {
    logEmployeeLoginRepository(emp.employee_id, clientIp ?? null, userAgent ?? '', false, '账号待审批').catch(() => {});
    return { success: false, error: '账号正在等待管理员审批，请耐心等待' };
  }
  if (emp.status !== 'active') {
    logEmployeeLoginRepository(emp.employee_id, clientIp ?? null, userAgent ?? '', false, `账号状态异常: ${emp.status}`).catch(() => {});
    return { success: false, error: '账号已被禁用，请联系管理员' };
  }

  // 3. 维护模式（平台超管不拦截，RPC 不存在时跳过）
  if (!emp.is_super_admin) {
    try {
      const maintenance = await getMaintenanceModeStatusRepository(emp.tenant_id ?? null);
      if (maintenance.effectiveEnabled) {
        return { success: false, error: '系统维护中，请稍后再试' };
      }
    } catch (_) {
      // RPC 可能不存在，跳过维护模式检查
    }
  }

  // 4. 记录登录成功（可选，失败不影响登录）
  logEmployeeLoginRepository(emp.employee_id, clientIp ?? null, userAgent ?? '', true).catch(() => {});
  clearEmployeeLoginFailuresRepository(emp.employee_id).catch(() => {});

  // 平台总管理员：admin 账号或 RPC 返回的 is_platform_super_admin（verify_employee_login_detailed 未返回该字段时，admin+is_super_admin 视为平台总管）
  const isPlatformSuperAdmin =
    emp.is_platform_super_admin ?? (emp.username === 'admin' && (emp.is_super_admin ?? false));

  // 严格区分：平台总管理 ≠ 租户账号。平台总管理不携带业务租户 tenant_id，避免被误当作租户用户
  const effectiveTenantId = isPlatformSuperAdmin ? null : (emp.tenant_id ?? null);
  const empWithPlatform = {
    ...emp,
    is_platform_super_admin: isPlatformSuperAdmin,
    tenant_id: effectiveTenantId,
  };

  // 5. 生成 JWT（含完整用户信息，供 /me 在 DB 查询失败时回退使用）
  const payload: JwtPayload = {
    sub: emp.employee_id,
    email: `${emp.username}@system.local`,
    tenant_id: effectiveTenantId ?? undefined,
    role: emp.role,
    username: emp.username,
    real_name: emp.real_name,
    status: emp.status,
    is_super_admin: emp.is_super_admin ?? false,
    is_platform_super_admin: isPlatformSuperAdmin,
  };
  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: JWT_EXPIRES_IN });

  const user = toAuthUser(empWithPlatform);
  return { success: true, token, user };
}

export async function registerService(params: {
  username: string;
  password: string;
  realName: string;
  invitationCode?: string;
}): Promise<{ success: boolean; error_code?: string; assigned_status?: string; message?: string }> {
  const result = await signupEmployeeRepository({
    username: params.username,
    password: params.password,
    realName: params.realName,
    invitationCode: params.invitationCode ?? null,
  });
  if (!result.success) {
    const msg = result.error_code === 'USERNAME_EXISTS' ? '用户名已存在'
      : result.error_code === 'INVITATION_CODE_REQUIRED' ? '请输入邀请码'
      : result.error_code === 'INVALID_INVITATION_CODE' ? '邀请码无效'
      : result.error_code === 'INVITATION_CODE_EXPIRED' ? '邀请码已过期'
      : result.error_code === 'INVITATION_CODE_USED' ? '邀请码已被使用完'
      : '注册失败';
    return { success: false, error_code: result.error_code, message: msg };
  }
  return { success: true, assigned_status: result.assigned_status };
}

export function verifyTokenService(token: string): JwtPayload | null {
  return verifyToken(token);
}

export async function getMeService(employeeId: string): Promise<AuthUser | null> {
  const emp = await getEmployeeByIdRepository(employeeId);
  if (!emp) return null;
  const isPlatform = emp.is_platform_super_admin ?? (emp.username === 'admin' && (emp.is_super_admin ?? false));
  // 平台总管理：tenant_id 强制为 null，与租户账号严格区分
  const empForAuth = isPlatform ? { ...emp, tenant_id: null } : emp;
  return toAuthUser(empForAuth);
}
