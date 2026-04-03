import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import type { AppRole } from '@/stores/employeeStore';
import { preloadSharedData, ensureDefaultSharedData, setSharedDataTenantId } from '@/services/finance/sharedDataService';

import { initializeReferralCache } from '@/stores/referralStore';
import { setOperatorCache, clearOperatorCache } from '@/services/members/operatorService';
import { initNameResolver, resetNameResolver } from '@/services/members/nameResolver';
import { initializeUserDataSync } from '@/services/userDataSyncService';
import { withTimeout, TIMEOUT } from '@/lib/withTimeout';
import { notify } from "@/lib/notifyHub";
import { cleanupCacheManager } from '@/services/cacheManager';
import { resetReferralCache } from '@/stores/referralStore';
import { resetPointsSettingsCache } from '@/stores/pointsSettingsStore';
import { queryClient } from '@/lib/queryClient';
import { spaNavigate } from '@/lib/spaNavigation';
import { hardRedirectToStaff, shouldHardRedirectToStaffPortal } from '@/lib/crossPortalNavigation';
import { fetchCardsFromDb, fetchVendorsFromDb, fetchPaymentProvidersFromDb } from '@/hooks/useMerchantConfig';
import { fetchActivityTypesFromDb } from '@/hooks/useActivityTypes';
import { checkApiRateLimitResult } from '@/services/rateLimitService';
import { loginApi, logoutApi, getCurrentUserApi, getPlatformTenantId } from '@/services/auth/authApiService';
import { hasAuthToken, clearAuthToken, API_ACCESS_TOKEN_KEY } from '@/api/client';
import { AUTH_UNAUTHORIZED_EVENT } from '@/api/init';
import { getRolePermissions } from '@/services/staff/dataApi';

// IP 国家校验间隔时间（毫秒）- 每5分钟检查一次
const IP_VALIDATION_INTERVAL = 5 * 60 * 1000;

function _t(_zh: string, en: string): string {
  return en;
}

// 检测是否为生产环境
function isProductionEnvironment(): boolean {
  const hostname = window.location.hostname;
  
  // 开发/预览域名不执行严格校验
  const devPatterns = [
    /localhost$/,
    /127\.0\.0\.1$/,
  ];
  
  return !devPatterns.some(pattern => pattern.test(hostname));
}

// 获取客户端IP地址（走后端 API，不再直连 Supabase Edge Function）
async function getClientIp(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/client-ip', { cache: 'no-store' });
    const data = await res.json();
    return data.ip || null;
  } catch (err) {
    console.warn('[AuthContext] getClientIp failed:', err);
    return null;
  }
}

// IP 国家校验结果接口
interface IpValidationResult {
  valid: boolean;
  skipped?: boolean;
  reason?: string;
  source?: string;
  ip?: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  error?: string;
  message?: string;
}

/** 走后端公开接口，按平台「IP 访问控制」中的国家/地区策略校验（无需 Supabase Edge） */
async function checkIpAccess(): Promise<IpValidationResult> {
  try {
    const base = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
    const path = '/api/data/settings/ip-country-check';
    const url = base ? `${base}${path}` : path;
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const json = (await response.json()) as { data?: IpValidationResult; success?: boolean };
    const data = json?.data ?? (json as unknown as IpValidationResult);
    if (data?.skipped) {
      return { valid: true, skipped: true, ...data };
    }
    if (data?.valid === false) {
      return {
        valid: false,
        skipped: false,
        ip: data.ip,
        country_code: data.country_code,
        country_name: data.country_name,
        error: data.error,
        message: data.message || _t('您的IP地址不符合登录地区策略', 'Your IP does not meet the login region policy'),
      };
    }
    return { valid: true, skipped: false, ip: data?.ip, country_code: data?.country_code, country_name: data?.country_name };
  } catch (error) {
    console.warn('[AuthContext] IP country check failed:', error);
    return {
      valid: true,
      skipped: true,
      reason: 'NETWORK_ERROR',
    };
  }
}

// 登录日志由后端 login API 记录，此处不再单独调用

/**
 * 账号类型严格区分：
 * - 平台总管理：is_platform_super_admin=true，tenant_id 始终为 null，登录后进入平台后台
 * - 租户账号：is_platform_super_admin=false，tenant_id 为业务租户 ID，只能看本租户数据
 */
export interface EmployeeInfo {
  id: string;
  username: string;
  real_name: string;
  role: AppRole;
  status: string;
  is_super_admin: boolean;
  /** 平台总管理员（platform 租户 + is_super_admin），tenant_id 强制 null */
  is_platform_super_admin?: boolean;
  /** 所属租户 ID。平台总管理为 null；租户员工为业务租户 ID */
  tenant_id?: string | null;
}

export interface RolePermissionRecord {
  id: string;
  /** staff | manager | admin | super_admin（与 employees.role 区分：总管理员用 super_admin 存导航/数据权限行） */
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

type UserType = 'member' | 'employee' | null;

interface AuthContextType {
  user: { id: string; email?: string } | null;
  session: { access_token?: string } | null;
  employee: EmployeeInfo | null;
  userType: UserType;
  profileMemberId: string | null;
  profileEmployeeId: string | null;
  permissions: RolePermissionRecord[];
  loading: boolean;
  permissionsLoaded: boolean;
  dataSynced: boolean;
  authStep: string | null;
  signIn: (
    username: string,
    password: string,
    deviceId?: string | null
  ) => Promise<{ success: boolean; message: string; user?: EmployeeInfo }>;
  signOut: () => Promise<void>;
  updateEmployeeLocal: (patch: Partial<EmployeeInfo>) => void;
  refreshEmployee: () => Promise<void>;
  /** 保存权限后调用，立即刷新 role_permissions 缓存 */
  refreshPermissions: () => Promise<void>;
  isAuthenticated: boolean;
  isEmployeeAuthenticated: boolean;
  isMemberAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 数据同步超时时间
const DATA_SYNC_TIMEOUT = 10000;
// 初始化最大超时时间（防止永久卡死）
const AUTH_INIT_TIMEOUT = 8000;
// 运行期兜底超时（防止异常路径导致长期 loading）
const AUTH_LOADING_WATCHDOG_TIMEOUT = 12000;

// ─── Employee sessionStorage 缓存（仅本标签页、仅 UX）──────────────────────────
// 非权限/租户真源：role、tenant_id 等必须以登录后 getCurrentUserApi 与后续 refresh 为准；
// 此处仅用于刷新页面时减少头像区闪烁；权限列表始终来自 loadPermissions() API。
const EMPLOYEE_CACHE_KEY = 'auth_employee_cache';

function readEmployeeCache(): EmployeeInfo | null {
  try {
    const raw = sessionStorage.getItem(EMPLOYEE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmployeeInfo;
  } catch {
    return null;
  }
}
function writeEmployeeCache(emp: EmployeeInfo | null) {
  try {
    if (emp) {
      sessionStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify(emp));
    } else {
      sessionStorage.removeItem(EMPLOYEE_CACHE_KEY);
    }
  } catch { /* ignore */ }
}

/** 权限轮询结果与内存一致时跳过 setState，避免整树无意义重渲染 */
function sameRolePermissions(a: RolePermissionRecord[], b: RolePermissionRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.role !== y.role ||
      x.module_name !== y.module_name ||
      x.field_name !== y.field_name ||
      x.can_view !== y.can_view ||
      x.can_edit !== y.can_edit ||
      x.can_delete !== y.can_delete
    ) {
      return false;
    }
  }
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  // 启动时先读 sessionStorage 占位（见 EMPLOYEE_CACHE_KEY 注释），随后由 getCurrentUserApi 覆盖为真源
  const [employee, setEmployee] = useState<EmployeeInfo | null>(() => readEmployeeCache());
  const [userType, setUserType] = useState<UserType>(null);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RolePermissionRecord[]>([]);
  // 本地 JWT 存在时必须等 getCurrentUserApi 落盘 session，否则 ProtectedRoute 会在首帧看到
  // loading=false + session=null 而误判未登录（sessionStorage 员工缓存不能代替已认证 session）。
  const [loading, setLoading] = useState(() => hasAuthToken());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [dataSynced, setDataSynced] = useState(false);
  const [authStep, setAuthStep] = useState<string | null>(null);
  const dataSyncAttemptRef = useRef(0);
  const lastSyncedUserIdRef = useRef<string | null>(null);
  const isSyncingRef = useRef(false);
  const initCompletedRef = useRef(!hasAuthToken());
  const ipValidationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isValidatingIpRef = useRef(false);
  const skipNextInitAuthCheckRef = useRef(false); // signIn 成功后跳过 init 的 getCurrentUserApi，避免竞态

  // 监听 401：API 客户端已清除 token 并即将跳转，同步清除本地状态避免闪退后状态残留
  useEffect(() => {
    const handler = () => {
      setSharedDataTenantId(null);
      writeEmployeeCache(null);
      setEmployee(null);
      setSession(null);
      setUser(null);
      setUserType(null);
      setProfileEmployeeId(null);
      setProfileMemberId(null);
      clearOperatorCache();
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  }, []);

  // 全局兜底：任何场景 loading 持续过久都强制结束，避免页面长期骨架屏
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('[AuthContext] Loading watchdog timeout, forcing loading=false');
        setLoading(false);
        setDataSynced(true);
      }
    }, AUTH_LOADING_WATCHDOG_TIMEOUT);
    return () => clearTimeout(timer);
  }, [loading]);

  // 统一的 employee 更新：同步写缓存
  const setAndCacheEmployee = useCallback((emp: EmployeeInfo | null) => {
    writeEmployeeCache(emp);
    setEmployee(emp);
  }, []);

  // IP 国家校验 - 失败时强制登出
  const performIpValidation = useCallback(async (forceLogout: boolean = true): Promise<boolean> => {
    // 防止并发执行
    if (isValidatingIpRef.current) {
      return true;
    }
    
    // 非生产环境跳过校验
    if (!isProductionEnvironment()) {
      // Dev environment, skipping IP validation
      return true;
    }
    
    isValidatingIpRef.current = true;
    
    try {
      const result = await checkIpAccess();
      
      // 后端已跳过校验（开发环境或功能未启用）
      if (result.skipped) {
        // IP validation skipped by backend
        return true;
      }
      
      if (!result.valid) {
        console.warn('[AuthContext] IP country validation failed');
        
        if (forceLogout && session) {
          // 显示错误提示
          notify.error(result.message || _t('您的IP地址不在允许的地区范围内', 'Your IP address is not in the allowed region'), {
            duration: 10000,
            description: `IP: ${result.ip || 'unknown'}, ${_t('国家', 'Country')}: ${result.country_name || result.country_code || 'unknown'}`,
          });
          
          // 强制登出
          await logoutApi();
          setUser(null);
          setSession(null);
          writeEmployeeCache(null);
          setEmployee(null);
          clearOperatorCache();
          
          if (shouldHardRedirectToStaffPortal()) {
            hardRedirectToStaff('/staff/login');
          } else {
            spaNavigate('/staff/login', { replace: true });
          }
        }
        
        return false;
      }
      
      // IP validation passed
      return true;
    } catch (error) {
      console.error('[AuthContext] IP validation error:', error);
      // 验证出错时，出于安全考虑，也强制登出
      if (forceLogout && session) {
        notify.error(_t('IP验证服务异常，请重新登录', 'IP verification error, please login again'));
        await logoutApi();
        setUser(null);
        setSession(null);
        writeEmployeeCache(null);
        setEmployee(null);
        clearOperatorCache();
        if (shouldHardRedirectToStaffPortal()) {
          hardRedirectToStaff('/staff/login');
        } else {
          spaNavigate('/staff/login', { replace: true });
        }
      }
      return false;
    } finally {
      isValidatingIpRef.current = false;
    }
  }, [session]);

  // 启动定期 IP 校验
  const startIpValidationInterval = useCallback(() => {
    // 清除已有的定时器
    if (ipValidationIntervalRef.current) {
      clearInterval(ipValidationIntervalRef.current);
    }
    
    // 设置新的定时器
    ipValidationIntervalRef.current = setInterval(() => {
      if (session && employee) {
        // Periodic IP validation
        performIpValidation(true);
      }
    }, IP_VALIDATION_INTERVAL);
    
    // IP validation interval started
  }, [session, employee, performIpValidation]);

  // 停止定期 IP 校验
  const stopIpValidationInterval = useCallback(() => {
    if (ipValidationIntervalRef.current) {
      clearInterval(ipValidationIntervalRef.current);
      ipValidationIntervalRef.current = null;
      // IP validation interval stopped
    }
  }, []);

  // 数据同步函数 - 使用 ref 避免依赖循环
  const syncUserData = useCallback(async (userId: string) => {
    // 防止并发执行
    if (isSyncingRef.current) {
      return;
    }
    
    // 如果已同步过同一用户，跳过
    if (userId === lastSyncedUserIdRef.current) {
      setDataSynced(true);
      return;
    }
    
    // 用户变更时重置
    lastSyncedUserIdRef.current = userId;
    dataSyncAttemptRef.current = 0;
    
    // 防止多次重试
    if (dataSyncAttemptRef.current >= 3) {
      console.warn('[AuthContext] Max sync attempts reached, marking as synced');
      setDataSynced(true);
      return;
    }
    
    isSyncingRef.current = true;
    dataSyncAttemptRef.current += 1;
    
    // 设置超时保护
    const timeoutId = setTimeout(() => {
      console.warn('[AuthContext] Data sync timeout, forcing completion');
      setDataSynced(true);
      isSyncingRef.current = false;
    }, DATA_SYNC_TIMEOUT);
    
    try {
      // 并行执行所有初始化任务，每个独立捕获错误
      await Promise.all([
        initializeUserDataSync().catch(err => {
          console.error('User data sync failed:', err);
          return null;
        }),
        ensureDefaultSharedData().catch(err => {
          console.error('Shared data init failed:', err);
          return null;
        }),
        initNameResolver().catch(err => {
          console.error('Name resolver init failed:', err);
          return null;
        }),
      ]);
      
      // 预加载共享数据（失败不阻塞）
      await preloadSharedData().catch(err => {
        console.error('Preload shared data failed:', err);
        return null;
      });
      
      // 预热 react-query 缓存（后台并行，不阻塞）
      // 使用 dynamic import 打破 AuthContext ↔ useEmployees / useMembers 循环依赖
      Promise.all([
        import('@/hooks/useEmployees').then(m =>
          queryClient.prefetchQuery({ queryKey: ['employees'], queryFn: () => m.fetchEmployeesFromDb(null) })
        ),
        queryClient.prefetchQuery({ queryKey: ['cards'], queryFn: fetchCardsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['vendors'], queryFn: fetchVendorsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['payment-providers'], queryFn: fetchPaymentProvidersFromDb }),
        queryClient.prefetchQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypesFromDb }),
        import('@/hooks/useMembers').then(m =>
          queryClient.prefetchQuery({ queryKey: ['members', null], queryFn: () => m.fetchMembersFromDb(null, true) })
        ),
      ]).catch(err => console.error('Prefetch failed:', err));
    } finally {
      clearTimeout(timeoutId);
      setDataSynced(true);
      isSyncingRef.current = false;
      window.dispatchEvent(new Event('userDataSynced'));
    }
  }, []);

  // 加载权限数据 - 通过 API 获取（与上次一致时不 setState，减轻员工端整树重绘）
  const loadPermissions = useCallback(async () => {
    try {
      const data = await getRolePermissions();
      const next = (data || []) as RolePermissionRecord[];
      setPermissions((prev) => (sameRolePermissions(prev, next) ? prev : next));
      setPermissionsLoaded(true);
    } catch (error) {
      console.error('[AuthContext] Failed to load permissions:', error);
      setPermissionsLoaded(true);
    }
  }, []);

  // 刷新员工信息（供外部调用）
  const refreshEmployee = useCallback(async () => {
    const authUser = await getCurrentUserApi();
    if (authUser) {
      const tenantId = authUser.is_platform_super_admin ? (authUser.tenant_id || getPlatformTenantId() || authUser.tenant_id) : (authUser.tenant_id ?? null);
      setSharedDataTenantId(tenantId);
      const empInfo: EmployeeInfo = {
        id: authUser.id,
        username: authUser.username,
        real_name: authUser.real_name,
        role: authUser.role as AppRole,
        status: authUser.status,
        is_super_admin: authUser.is_super_admin ?? false,
        is_platform_super_admin: authUser.is_platform_super_admin ?? false,
        tenant_id: tenantId,
      };
      setAndCacheEmployee(empInfo);
      setOperatorCache({
        id: authUser.id,
        account: authUser.username,
        role: authUser.role,
        realName: authUser.real_name,
      });
    }
  }, [setAndCacheEmployee]);

  // 初始化认证状态和订阅
  useEffect(() => {
    let isMounted = true;

    // 初始化超时兜底 - 防止永久卡死
    const initTimeoutId = setTimeout(() => {
      if (isMounted && loading && !initCompletedRef.current) {
        console.warn('[AuthContext] Init timeout reached, forcing loading=false');
        setLoading(false);
        setDataSynced(true);
        initCompletedRef.current = true;
      }
    }, AUTH_INIT_TIMEOUT);

    const finishInit = () => {
      if (isMounted && !initCompletedRef.current) {
        setLoading(false);
        setDataSynced(true);
        initCompletedRef.current = true;
      }
    };

    if (hasAuthToken()) {
      if (skipNextInitAuthCheckRef.current) {
        skipNextInitAuthCheckRef.current = false;
        finishInit();
        // fall through to cleanup registration below
      } else {
      getCurrentUserApi().then((authUser) => {
        if (!isMounted) return;
        if (authUser) {
          // 平台总管理 ≠ 租户账号：tenant_id 强制为 null，严格区分
          const tenantId = authUser.is_platform_super_admin ? (authUser.tenant_id || getPlatformTenantId() || authUser.tenant_id) : (authUser.tenant_id ?? null);
          setSharedDataTenantId(tenantId);
          const empInfo: EmployeeInfo = {
            id: authUser.id,
            username: authUser.username,
            real_name: authUser.real_name,
            role: authUser.role as AppRole,
            status: authUser.status,
            is_super_admin: authUser.is_super_admin ?? false,
            is_platform_super_admin: authUser.is_platform_super_admin ?? false,
            tenant_id: tenantId,
          };
          setSession({ access_token: 'jwt' });
          setUser({ id: authUser.id, email: `${authUser.username}@system.local` });
          setAndCacheEmployee(empInfo);
          setUserType('employee');
          setProfileEmployeeId(authUser.id);
          setProfileMemberId(null);
          setOperatorCache({
            id: authUser.id,
            account: authUser.username,
            role: authUser.role,
            realName: authUser.real_name,
          });

          // Supabase auth session 已移除 - 认证完全走后端 JWT

          syncUserData(authUser.id).finally(finishInit);
        } else {
          setSharedDataTenantId(null);
          clearAuthToken();
          writeEmployeeCache(null);
          setEmployee(null);
          setSession(null);
          setUser(null);
          setDataSynced(true);
          finishInit();
        }
      }).catch((err) => {
        console.error('[AuthContext] getCurrentUserApi error:', err);
        setSharedDataTenantId(null);
        clearAuthToken();
        writeEmployeeCache(null);
        setEmployee(null);
        setSession(null);
        setUser(null);
        setDataSynced(true);
        finishInit();
      });
      }
    } else {
      setSharedDataTenantId(null);
      writeEmployeeCache(null);
      setEmployee(null);
      setSession(null);
      setUser(null);
      setDataSynced(true);
      finishInit();
    }

    return () => {
      isMounted = false;
      clearTimeout(initTimeoutId);
    };
  }, [syncUserData, setAndCacheEmployee]);

  // 加载权限并轮询更新（替代 Realtime 订阅）；后台标签页不轮询，减少卡顿与无效渲染
  useEffect(() => {
    if (!employee) return;
    loadPermissions();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void loadPermissions();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [employee, loadPermissions]);

  // IP 国家校验 - 用户登录后和会话恢复时触发
  useEffect(() => {
    if (session && employee && !loading) {
      // 会话恢复后验证 IP
      // Session restored, validating IP country
      performIpValidation(true);
      
      // 启动定期校验
      startIpValidationInterval();
    } else {
      // 未登录时停止校验
      stopIpValidationInterval();
    }
    
    return () => {
      stopIpValidationInterval();
    };
  }, [session, employee, loading, performIpValidation, startIpValidationInterval, stopIpValidationInterval]);

  const signIn = useCallback(async (
    username: string,
    password: string,
    deviceId?: string | null
  ): Promise<{ success: boolean; message: string; user?: EmployeeInfo }> => {
    const normalizedUsername = username.trim();
    try {
      setAuthStep(_t('验证账号...', 'Verifying account...'));

      // 本地开发环境跳过限流和 IP 校验，直接调用登录 API（避免 Supabase check_api_rate_limit 400 等阻塞）
      if (isProductionEnvironment()) {
        const clientIp = await getClientIp();
        try {
          const actorKey = `${normalizedUsername}|${clientIp || 'unknown'}`;
          const rateLimit = await checkApiRateLimitResult({
            scope: 'staff_login',
            actorKey,
            limit: 20,
            windowSeconds: 300,
          });
          if (rateLimit.ok && !rateLimit.data.allowed) {
            setAuthStep(null);
            const retryMin = Math.max(1, Math.ceil((rateLimit.data.retryAfterSeconds || 60) / 60));
            return { success: false, message: _t(`请求过于频繁，请${retryMin}分钟后再试`, `Too many requests, please try again in ${retryMin} minute(s)`) };
          }
        } catch {
          /* ignore: rate-limit check optional */
        }

        try {
          setAuthStep(_t('验证访问区域...', 'Verifying access region...'));
          const ipValidation = await checkIpAccess();
          if (!ipValidation.skipped && !ipValidation.valid) {
            setAuthStep(null);
            return {
              success: false,
              message: ipValidation.message || _t(`访问被拒绝：您的IP (${ipValidation.ip}) 不在允许的地区范围内`, `Access denied: your IP (${ipValidation.ip}) is not in the allowed region`),
            };
          }
        } catch {
          /* ignore: IP check optional */
        }
      }

      setAuthStep(_t('连接认证服务...', 'Connecting to auth service...'));
      const result = await withTimeout(
        loginApi(normalizedUsername, password, deviceId ?? undefined),
        TIMEOUT.AUTH,
        _t('登录超时，请检查网络', 'Login timeout, please check your network')
      );

      if (!result.success) {
        setAuthStep(null);
        return { success: false, message: result.message || _t('登录失败', 'Login failed') };
      }

      const authUser = result.user!;
      const tenantId = authUser.is_platform_super_admin ? (authUser.tenant_id || getPlatformTenantId() || authUser.tenant_id) : (authUser.tenant_id ?? null);
      setSharedDataTenantId(tenantId);
      const empInfo: EmployeeInfo = {
        id: authUser.id,
        username: authUser.username,
        real_name: authUser.real_name,
        role: authUser.role as AppRole,
        status: authUser.status,
        is_super_admin: authUser.is_super_admin ?? false,
        is_platform_super_admin: authUser.is_platform_super_admin ?? false,
        tenant_id: tenantId,
      };
      setSession({ access_token: 'jwt' });
      setUser({ id: authUser.id, email: `${authUser.username}@system.local` });
      setAndCacheEmployee(empInfo);
      setUserType('employee');
      setProfileEmployeeId(authUser.id);
      setProfileMemberId(null);
      setOperatorCache({
        id: authUser.id,
        account: authUser.username,
        role: authUser.role,
        realName: authUser.real_name,
      });

      // Supabase auth session 已移除 - 认证完全走后端 JWT

      preloadSharedData().catch(console.error);
      initializeReferralCache().catch(console.error);
      syncUserData(authUser.id).catch(console.error);

      skipNextInitAuthCheckRef.current = true; // 避免 init 重跑时再次请求 /me 导致竞态
      setLoading(false);
      setDataSynced(true);
      initCompletedRef.current = true;
      setAuthStep(null);
      return { success: true, message: _t(`欢迎回来，${authUser.real_name}！`, `Welcome back, ${authUser.real_name}!`), user: empInfo };
    } catch (error: any) {
      console.error('Sign in error:', error);
      setAuthStep(null);
      if (error?.message?.includes('超时')) {
        return { success: false, message: error.message };
      }
      return { success: false, message: error?.message || _t('登录失败', 'Login failed') };
    }
  }, [syncUserData, setAndCacheEmployee]);

  const signOut = useCallback(async () => {
    // 1. 停止 IP 校验定时器
    stopIpValidationInterval();
    
    // 2. 退出认证（清除 token）
    await logoutApi();
    
    // 3. 清空组件状态 + 清除员工缓存
    setUser(null);
    setSession(null);
    setSharedDataTenantId(null);
    setAndCacheEmployee(null);
    setUserType(null);
    setProfileMemberId(null);
    setProfileEmployeeId(null);
    setPermissions([]);
    setPermissionsLoaded(false);
    setDataSynced(false);
    lastSyncedUserIdRef.current = null;
    dataSyncAttemptRef.current = 0;
    isSyncingRef.current = false;
    
    // 4. 清除所有全局缓存
    clearOperatorCache();
    
    // 5. 清理缓存管理器（取消 Realtime 订阅 + 清空缓存）
    cleanupCacheManager();
    
    // 6. 重置各模块缓存
    resetNameResolver();
    resetReferralCache();
    resetPointsSettingsCache();
    
    // 7. 清空 React Query 缓存（员工敏感数据）
    queryClient.clear();

    // Sign out complete, all caches cleared
  }, [stopIpValidationInterval]);

  const updateEmployeeLocal = useCallback((patch: Partial<EmployeeInfo>) => {
    setEmployee((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      writeEmployeeCache(next);
      return next;
    });
  }, []);

  const isAuthenticated = !!session && !!employee;
  const isEmployeeAuthenticated = !!session && userType === 'employee' && !!employee;
  const isMemberAuthenticated = !!session && userType === 'member';
  const isAdmin =
    employee?.role === 'admin' ||
    employee?.is_super_admin === true ||
    employee?.is_platform_super_admin === true;
  const isManager = employee?.role === 'admin' || employee?.role === 'manager';

  const authContextValue = useMemo(
    () => ({
      user,
      session,
      employee,
      userType,
      profileMemberId,
      profileEmployeeId,
      permissions,
      loading,
      permissionsLoaded,
      dataSynced,
      authStep,
      signIn,
      signOut,
      updateEmployeeLocal,
      refreshEmployee,
      refreshPermissions: loadPermissions,
      isAuthenticated,
      isEmployeeAuthenticated,
      isMemberAuthenticated,
      isAdmin,
      isManager,
    }),
    [
      user,
      session,
      employee,
      userType,
      profileMemberId,
      profileEmployeeId,
      permissions,
      loading,
      permissionsLoaded,
      dataSynced,
      authStep,
      signIn,
      signOut,
      updateEmployeeLocal,
      refreshEmployee,
      loadPermissions,
      isAuthenticated,
      isEmployeeAuthenticated,
      isMemberAuthenticated,
      isAdmin,
      isManager,
    ],
  );

  return <AuthContext.Provider value={authContextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
