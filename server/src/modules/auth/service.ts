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
import { assertStaffLoginAccessControl } from '../../lib/staffLoginAccess.js';
import { getWhitelistConfig, isEmployeeDeviceAllowedRepository, onSuccessfulStaffLoginWithDevice } from '../adminDeviceWhitelist/service.js';
import { normalizeStaffDeviceId } from '../adminDeviceWhitelist/deviceId.js';

const JWT_EXPIRES_IN = '7d';
/** 刷新窗口：token 过期后仍可在此时间内用于刷新（7 天） */
const JWT_REFRESH_WINDOW_SECONDS = 7 * 24 * 60 * 60;

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

  const ip = clientIp ?? null;
  const ua = userAgent ?? '';

  // 1. 检查登录锁定（可选，RPC 不存在时跳过）
  let lock = { is_locked: false, remaining_seconds: 0 };
  try {
    lock = await checkEmployeeLoginLockRepository(username);
  } catch (_) {
    // RPC 可能不存在，跳过锁定检查
  }
  if (lock.is_locked) {
    logEmployeeLoginRepository(null, ip, ua, false, '账号已锁定', username).catch(e => console.error('[Auth] login log write failed:', e));
    const minutes = Math.max(1, Math.ceil((lock.remaining_seconds ?? 0) / 60));
    return { success: false, error: `账号已临时锁定，请${minutes}分钟后重试` };
  }

  // 2. 验证账号密码
  const { data: verifyData, error: verifyError } = await verifyEmployeeLoginRepository(username, params.password);
  if (verifyError) {
    logEmployeeLoginRepository(null, ip, ua, false, '系统验证异常', username).catch(e => console.error('[Auth] login log write failed:', e));
    console.error('[Auth] verifyEmployeeLoginRepository:', verifyError);
    const anyErr = verifyError as Error & { code?: string; errno?: number };
    const errno = anyErr.errno;
    const sqlCode = anyErr.code;
    const text = (verifyError.message || '').toLowerCase();
    if (sqlCode === 'ER_ACCESS_DENIED_ERROR' || errno === 1045) {
      return {
        success: false,
        error:
          '无法连接数据库：请检查 server/.env 中的 MYSQL_USER、MYSQL_PASSWORD（或 DATABASE_URL）是否正确，并确认 MySQL 已启动。',
      };
    }
    if (sqlCode === 'ECONNREFUSED' || text.includes('econnrefused')) {
      return { success: false, error: '无法连接数据库：MySQL 未启动或主机/端口配置错误。' };
    }
    if (sqlCode === 'ETIMEDOUT' || text.includes('etimedout')) {
      return {
        success: false,
        error:
          '无法连接数据库：连接超时。请检查 EC2/RDS 安全组是否放行本机 IP 的 3306，或改用 SSH 隧道并把 DATABASE_URL 指向 127.0.0.1。',
      };
    }
    if (sqlCode === 'ER_BAD_DB_ERROR' || errno === 1049) {
      return {
        success: false,
        error: '数据库不存在：请创建 MYSQL_DATABASE 指定的库，并启动后端以完成迁移。',
      };
    }
    if (sqlCode === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      return { success: false, error: '数据库表缺失：请确认已运行迁移（开发环境启动 API 会自动迁移）。' };
    }
    return { success: false, error: '登录验证失败（数据库异常），请查看服务端日志或联系管理员。' };
  }
  if (!verifyData || verifyData.length === 0) {
    logEmployeeLoginRepository(null, ip, ua, false, '验证无结果', username).catch(e => console.error('[Auth] login log write failed:', e));
    return { success: false, error: '验证失败，请稍后重试' };
  }

  const result = verifyData[0];
  const errorCode = (result as { error_code?: string }).error_code;
  if (errorCode === 'USER_NOT_FOUND') {
    logEmployeeLoginRepository(null, ip, ua, false, '账号不存在', username).catch(e => console.error('[Auth] login log write failed:', e));
    return { success: false, error: '账号不存在' };
  }
  if (errorCode === 'WRONG_PASSWORD') {
    const empId = (result as { employee_id?: string }).employee_id ?? null;
    logEmployeeLoginRepository(empId, ip, ua, false, '密码错误', username).catch(e => console.error('[Auth] login log write failed:', e));
    return { success: false, error: '密码错误' };
  }
  if (errorCode === 'ACCOUNT_DISABLED') {
    const empId = (result as { employee_id?: string }).employee_id ?? null;
    logEmployeeLoginRepository(empId, ip, ua, false, '账号已禁用', username).catch(e => console.error('[Auth] login log write failed:', e));
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
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, '账号待审批', username).catch(e => console.error('[Auth] login log write failed:', e));
    return { success: false, error: '账号正在等待管理员审批，请耐心等待' };
  }
  if (emp.status !== 'active') {
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, `账号状态异常: ${emp.status}`, username).catch(e => console.error('[Auth] login log write failed:', e));
    return { success: false, error: '账号已被禁用，请联系管理员' };
  }

  const accessGate = await assertStaffLoginAccessControl({
    clientIp: ip,
    employeeTenantId: emp.tenant_id ?? null,
    isPlatformSuperAdmin: !!emp.is_platform_super_admin,
  });
  if (!accessGate.ok) {
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, accessGate.message, username).catch((e) =>
      console.error('[Auth] login log write failed:', e),
    );
    return { success: false, error: accessGate.message };
  }

  // 3. 维护模式（平台超管不拦截，RPC 不存在时跳过）
  if (!emp.is_super_admin) {
    try {
      const maintenance = await getMaintenanceModeStatusRepository(emp.tenant_id ?? null);
      if (maintenance.effectiveEnabled) {
        logEmployeeLoginRepository(emp.employee_id, ip, ua, false, '系统维护中', username).catch(e => console.error('[Auth] login log write failed:', e));
        return { success: false, error: '系统维护中，请稍后再试' };
      }
    } catch (_) {
      // RPC 可能不存在，跳过维护模式检查
    }
  }

  // 平台管理员判定：平台租户(tenant_code='platform')中 is_super_admin 或 role=admin 的员工
  let isPlatformSuperAdmin = emp.is_platform_super_admin ?? false;
  if (!isPlatformSuperAdmin && (emp.is_super_admin || emp.role === 'admin')) {
    const empDetail = await getEmployeeByIdRepository(emp.employee_id);
    if (empDetail?.tenant_code === 'platform') {
      isPlatformSuperAdmin = true;
    }
  }

  const empWithPlatform = {
    ...emp,
    is_platform_super_admin: isPlatformSuperAdmin,
  };

  const wlCfg = await getWhitelistConfig();
  let boundDeviceId: string | undefined;
  if (wlCfg.enabled && !isPlatformSuperAdmin) {
    const did = normalizeStaffDeviceId(params.device_id);
    if (!did) {
      logEmployeeLoginRepository(emp.employee_id, ip, ua, false, '设备白名单：缺少或非法 device_id', username).catch((e) =>
        console.error('[Auth] login log write failed:', e),
      );
      console.log('[Auth][Device] login rejected: bad device_id', { username, ip });
      return { success: false, error: 'DEVICE_NOT_AUTHORIZED: 无法识别本机设备标识，请刷新页面后重试' };
    }
    let allowed: boolean;
    try {
      allowed = await isEmployeeDeviceAllowedRepository(emp.employee_id, did);
    } catch (e) {
      console.error('[Auth][Device] isEmployeeDeviceAllowedRepository:', e);
      return {
        success: false,
        httpStatus: 503,
        error: '设备白名单数据暂不可用，请稍后重试或联系管理员',
      };
    }
    if (!allowed) {
      logEmployeeLoginRepository(emp.employee_id, ip, ua, false, '设备未授权', username).catch((e) =>
        console.error('[Auth] login log write failed:', e),
      );
      console.log('[Auth][Device] login rejected: not whitelisted', { username, employeeId: emp.employee_id, deviceId: did, ip });
      return {
        success: false,
        error:
          'DEVICE_NOT_AUTHORIZED: 当前设备未授权登录后台。请在已授权设备上由管理员添加白名单，或登录后在「系统设置 → 后台登录设备」绑定本机。',
      };
    }
    boundDeviceId = did;
  }

  // 4. 记录登录成功（设备白名单已通过）
  logEmployeeLoginRepository(emp.employee_id, ip, ua, true, undefined, username).catch(e => console.error('[Auth] login log write failed:', e));
  clearEmployeeLoginFailuresRepository(emp.employee_id).catch(e => console.warn('[Auth] clearFailures:', e));

  if (boundDeviceId) {
    await onSuccessfulStaffLoginWithDevice({ employeeId: emp.employee_id, deviceId: boundDeviceId, clientIp: ip });
  }

  // 5. 生成 JWT（含完整用户信息，供 /me 在 DB 查询失败时回退使用）
  const payload: JwtPayload = {
    sub: emp.employee_id,
    email: `${emp.username}@system.local`,
    tenant_id: emp.tenant_id ?? undefined,
    role: emp.role,
    username: emp.username,
    real_name: emp.real_name,
    status: emp.status,
    is_super_admin: emp.is_super_admin ?? false,
    is_platform_super_admin: isPlatformSuperAdmin,
    ...(boundDeviceId ? { device_id: boundDeviceId } : {}),
  };
  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: JWT_EXPIRES_IN });

  // Supabase JWT 已不再需要（已迁移到 MySQL）

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
  try {
    const emp = await getEmployeeByIdRepository(employeeId);
    if (!emp) return null;
    // 平台管理员判定：tenant_code = 'platform' 的 is_super_admin 或 role=admin
    const isPlatform = emp.is_platform_super_admin ?? (emp.tenant_code === 'platform' && (emp.is_super_admin || emp.role === 'admin'));
    const empForAuth = { ...emp, is_platform_super_admin: isPlatform };
    return toAuthUser(empForAuth);
  } catch (e) {
    console.error('[Auth] getMeService error:', e);
    return null;
  }
}

/**
 * Token 刷新：验证旧 JWT（允许已过期但在刷新窗口内），签发新 JWT。
 * 同时重新查询员工状态，确保被禁用的账号无法刷新。
 */
export async function refreshTokenService(
  oldToken: string
): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  let decoded: JwtPayload | null = null;

  // 先尝试正常验证
  decoded = verifyToken(oldToken);

  // 如果正常验证失败，尝试忽略过期（在刷新窗口内）
  if (!decoded) {
    try {
      decoded = jwt.verify(oldToken, config.jwt.secret, {
        algorithms: ['HS256'],
        ignoreExpiration: true,
      }) as JwtPayload;
    } catch {
      return { success: false, error: 'INVALID_TOKEN' };
    }
  }

  if (!decoded?.sub) {
    return { success: false, error: 'INVALID_TOKEN' };
  }

  // 检查是否在刷新窗口内
  const exp = decoded.exp ?? 0;
  const now = Math.floor(Date.now() / 1000);
  if (now - exp > JWT_REFRESH_WINDOW_SECONDS) {
    return { success: false, error: 'REFRESH_WINDOW_EXPIRED' };
  }

  // 重新查询员工状态
  const emp = await getEmployeeByIdRepository(decoded.sub);
  if (!emp || emp.status !== 'active') {
    return { success: false, error: 'ACCOUNT_DISABLED' };
  }

  const isPlatform = emp.is_platform_super_admin ?? (emp.tenant_code === 'platform' && (emp.is_super_admin || emp.role === 'admin'));
  const user = toAuthUser({ ...emp, is_platform_super_admin: isPlatform });

  const payload: JwtPayload = {
    sub: emp.employee_id,
    email: emp.username,
    tenant_id: emp.tenant_id ?? undefined,
    role: emp.role,
    username: emp.username,
    real_name: emp.real_name,
    status: emp.status,
    is_super_admin: emp.is_super_admin,
    is_platform_super_admin: isPlatform,
    device_id: decoded.device_id,
  };

  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: JWT_EXPIRES_IN });
  return { success: true, token, user };
}
