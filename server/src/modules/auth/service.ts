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
import { logger } from '../../lib/logger.js';

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
    return { success: false, error: 'Username and password are required' };
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
    logEmployeeLoginRepository(null, ip, ua, false, 'Account locked', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    const minutes = Math.max(1, Math.ceil((lock.remaining_seconds ?? 0) / 60));
    return { success: false, error: `Account temporarily locked. Try again in ${minutes} minute(s).` };
  }

  // 2. 验证账号密码
  const { data: verifyData, error: verifyError } = await verifyEmployeeLoginRepository(username, params.password);
  if (verifyError) {
    logEmployeeLoginRepository(null, ip, ua, false, 'System verification error', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    logger.error('Auth', 'verifyEmployeeLoginRepository:', verifyError);
    const anyErr = verifyError as Error & { code?: string; errno?: number };
    const errno = anyErr.errno;
    const sqlCode = anyErr.code;
    const text = (verifyError.message || '').toLowerCase();
    if (sqlCode === 'ER_ACCESS_DENIED_ERROR' || errno === 1045) {
      return {
        success: false,
        error:
          'Database connection failed: check MYSQL_USER, MYSQL_PASSWORD (or DATABASE_URL) in server/.env, and ensure MySQL is running.',
      };
    }
    if (sqlCode === 'ECONNREFUSED' || text.includes('econnrefused')) {
      return { success: false, error: 'Database connection failed: MySQL is not running or host/port is misconfigured.' };
    }
    if (sqlCode === 'ETIMEDOUT' || text.includes('etimedout')) {
      return {
        success: false,
        error:
          'Database connection failed: connection timed out. Check EC2/RDS security groups allow port 3306 from this machine, or use an SSH tunnel and point DATABASE_URL to 127.0.0.1.',
      };
    }
    if (sqlCode === 'ER_BAD_DB_ERROR' || errno === 1049) {
      return {
        success: false,
        error: 'Database does not exist: create the database named in MYSQL_DATABASE and start the API to run migrations.',
      };
    }
    if (sqlCode === 'ER_NO_SUCH_TABLE' || errno === 1146) {
      return { success: false, error: 'Missing database tables: run migrations (starting the API in development applies them automatically).' };
    }
    return { success: false, error: 'Login verification failed (database error). Check server logs or contact an administrator.' };
  }
  if (!verifyData || verifyData.length === 0) {
    logEmployeeLoginRepository(null, ip, ua, false, 'Verification returned no result', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Verification failed. Please try again later.' };
  }

  const result = verifyData[0];
  const errorCode = (result as { error_code?: string }).error_code;
  if (errorCode === 'USER_NOT_FOUND') {
    logEmployeeLoginRepository(null, ip, ua, false, 'Account not found', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Account not found' };
  }
  if (errorCode === 'WRONG_PASSWORD') {
    const empId = (result as { employee_id?: string }).employee_id ?? null;
    logEmployeeLoginRepository(empId, ip, ua, false, 'Incorrect password', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Incorrect password' };
  }
  if (errorCode === 'ACCOUNT_DISABLED') {
    const empId = (result as { employee_id?: string }).employee_id ?? null;
    logEmployeeLoginRepository(empId, ip, ua, false, 'Account disabled', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Account disabled. Please contact an administrator.' };
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
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, 'Account pending approval', username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Your account is pending administrator approval. Please wait.' };
  }
  if (emp.status !== 'active') {
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, `Abnormal account status: ${emp.status}`, username).catch(e => logger.error('Auth', 'login log write failed:', e));
    return { success: false, error: 'Account disabled. Please contact an administrator.' };
  }

  const accessGate = await assertStaffLoginAccessControl({
    clientIp: ip,
    employeeTenantId: emp.tenant_id ?? null,
    isPlatformSuperAdmin: !!emp.is_platform_super_admin,
  });
  if (!accessGate.ok) {
    logEmployeeLoginRepository(emp.employee_id, ip, ua, false, accessGate.message, username).catch((e) =>
      logger.error('Auth', 'login log write failed:', e),
    );
    return { success: false, error: accessGate.message };
  }

  // H4 fix: compute isPlatformSuperAdmin BEFORE maintenance check so platform admins are never locked out
  let isPlatformSuperAdmin = emp.is_platform_super_admin ?? false;
  if (!isPlatformSuperAdmin && (emp.is_super_admin || emp.role === 'admin')) {
    const empDetail = await getEmployeeByIdRepository(emp.employee_id);
    if (empDetail?.tenant_code === 'platform') {
      isPlatformSuperAdmin = true;
    }
  }

  // 3. 维护模式（平台超管 + is_super_admin 不拦截；allowed_roles 白名单内的角色也不拦截）
  if (!emp.is_super_admin && !isPlatformSuperAdmin) {
    try {
      const maintenance = await getMaintenanceModeStatusRepository(emp.tenant_id ?? null);
      if (maintenance.effectiveEnabled) {
        const allowed = Array.isArray(maintenance.allowedRoles) ? maintenance.allowedRoles : [];
        const roleAllowed = allowed.length > 0 && emp.role && allowed.includes(emp.role);
        if (!roleAllowed) {
          logEmployeeLoginRepository(emp.employee_id, ip, ua, false, 'System under maintenance', username).catch(e => logger.error('Auth', 'login log write failed:', e));
          return { success: false, error: 'System under maintenance. Please try again later.' };
        }
      }
    } catch (_) {
      // 维护模式表可能不存在，跳过检查
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
      logEmployeeLoginRepository(emp.employee_id, ip, ua, false, 'Device whitelist: missing or invalid device_id', username).catch((e) =>
        logger.error('Auth', 'login log write failed:', e),
      );
      logger.info('Auth][Device', 'login rejected: bad device_id', { username, ip });
      return { success: false, error: 'DEVICE_NOT_AUTHORIZED: Could not identify this device. Refresh the page and try again.' };
    }
    let allowed: boolean;
    try {
      allowed = await isEmployeeDeviceAllowedRepository(emp.employee_id, did);
    } catch (e) {
      logger.error('Auth][Device', 'isEmployeeDeviceAllowedRepository:', e);
      return {
        success: false,
        httpStatus: 503,
        error: 'Device whitelist data is temporarily unavailable. Try again later or contact an administrator.',
      };
    }
    if (!allowed) {
      logEmployeeLoginRepository(emp.employee_id, ip, ua, false, 'Device not authorized', username).catch((e) =>
        logger.error('Auth', 'login log write failed:', e),
      );
      logger.info('Auth][Device', 'login rejected: not whitelisted', { username, employeeId: emp.employee_id, deviceId: did, ip });
      return {
        success: false,
        error:
          'DEVICE_NOT_AUTHORIZED: This device is not authorized for admin login. Have an administrator add it on an authorized device, or after signing in bind this device under System settings → Admin login devices.',
      };
    }
    boundDeviceId = did;
  }

  // 4. 记录登录成功（设备白名单已通过）
  logEmployeeLoginRepository(emp.employee_id, ip, ua, true, undefined, username).catch(e => logger.error('Auth', 'login log write failed:', e));
  clearEmployeeLoginFailuresRepository(emp.employee_id).catch(e => logger.warn('Auth', 'clearFailures:', e));

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
    const msg = result.error_code === 'USERNAME_EXISTS' ? 'Username already exists'
      : result.error_code === 'INVITATION_CODE_REQUIRED' ? 'Invitation code is required'
      : result.error_code === 'INVALID_INVITATION_CODE' ? 'Invalid invitation code'
      : result.error_code === 'INVITATION_CODE_EXPIRED' ? 'Invitation code has expired'
      : result.error_code === 'INVITATION_CODE_USED' ? 'Invitation code has no uses left'
      : 'Registration failed';
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
    logger.error('Auth', 'getMeService error:', e);
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
