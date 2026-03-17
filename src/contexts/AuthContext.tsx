import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { AppRole } from '@/stores/employeeStore';
import { preloadSharedData, ensureDefaultSharedData, setSharedDataTenantId } from '@/services/finance/sharedDataService';
import { initializeReferralCache } from '@/stores/referralStore';
import { setOperatorCache, clearOperatorCache } from '@/services/members/operatorService';
import { initNameResolver, resetNameResolver } from '@/services/members/nameResolver';
import { initializeUserDataSync } from '@/services/userDataSyncService';
import { withTimeout, TIMEOUT } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { cleanupCacheManager } from '@/services/cacheManager';
import { resetReferralCache } from '@/stores/referralStore';
import { resetPointsSettingsCache } from '@/stores/pointsSettingsStore';
import { queryClient } from '@/lib/queryClient';
import { fetchEmployeesFromDb } from '@/hooks/useEmployees';
import { fetchCardsFromDb, fetchVendorsFromDb, fetchPaymentProvidersFromDb } from '@/hooks/useMerchantConfig';
import { fetchActivityTypesFromDb } from '@/hooks/useActivityTypes';
import { fetchMembersFromDb } from '@/hooks/useMembers';
import { checkApiRateLimitResult } from '@/services/rateLimitService';
import { loginApi, logoutApi, getCurrentUserApi } from '@/services/auth/authApiService';
import { hasAuthToken, clearAuthToken } from '@/api/client';
import { AUTH_UNAUTHORIZED_EVENT } from '@/api/init';

// IP 国家校验间隔时间（毫秒）- 每5分钟检查一次
const IP_VALIDATION_INTERVAL = 5 * 60 * 1000;

// 检测是否为生产环境
function isProductionEnvironment(): boolean {
  const hostname = window.location.hostname;
  
  // 开发/预览域名不执行严格校验
  const devPatterns = [
    /\.lovableproject\.com$/,
    /id-preview--.*\.lovable\.app$/,
    /localhost$/,
    /127\.0\.0\.1$/,
  ];
  
  return !devPatterns.some(pattern => pattern.test(hostname));
}

// 获取客户端IP地址
async function getClientIp(): Promise<string | null> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );
    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.error('Failed to get client IP:', error);
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

// 校验 IP 国家
async function validateIpCountry(): Promise<IpValidationResult> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-ip-country`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.warn('[AuthContext] IP validation failed:', data);
      return {
        valid: false,
        error: data.error || 'VALIDATION_FAILED',
        message: data.message || 'IP验证失败',
        ...data,
      };
    }
    
    return data;
  } catch (error) {
    console.error('[AuthContext] IP validation error:', error);
    // 网络错误时，为避免误封用户，视为通过（跳过）
    return {
      valid: true,
      skipped: true,
      error: 'NETWORK_ERROR',
      reason: 'IP验证服务不可用，已跳过',
    };
  }
}

// 读取 IP 访问控制配置，决定是否执行国家校验
async function checkIpAccess(): Promise<IpValidationResult> {
  try {
    const { getIpAccessControlConfig } = await import('@/api/data');
    const config = await getIpAccessControlConfig();
    if (!config?.enabled) {
      console.log('[AuthContext] IP country validation skipped (not enabled in settings)');
      return { valid: true, skipped: true, reason: 'IP country control not enabled' };
    }
  } catch (err) {
    console.warn('[AuthContext] Failed to read IP control settings, skipping validation:', err);
    return { valid: true, skipped: true, reason: 'Could not read IP control settings' };
  }
  return validateIpCountry();
}

// 登录日志由后端 login API 记录，此处不再单独调用

/**
 * 账号类型严格区分：
 * - 平台总管理：is_platform_super_admin=true，tenant_id 始终为 null，登录后进入平台后台
 * - 租户账号：is_platform_super_admin=false，tenant_id 为业务租户 ID，只能看本租户数据
 */
interface EmployeeInfo {
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

interface RolePermissionRecord {
  id: string;
  role: AppRole;
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
  signIn: (username: string, password: string) => Promise<{ success: boolean; message: string; user?: EmployeeInfo }>;
  signOut: () => Promise<void>;
  updateEmployeeLocal: (patch: Partial<EmployeeInfo>) => void;
  refreshEmployee: () => Promise<void>;
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

// ─── Employee sessionStorage 缓存 ────────────────────────────────────────────
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  // 启动时先从 sessionStorage 读取缓存，实现刷新即时恢复
  const [employee, setEmployee] = useState<EmployeeInfo | null>(() => readEmployeeCache());
  const [userType, setUserType] = useState<UserType>(null);
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [profileEmployeeId, setProfileEmployeeId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<RolePermissionRecord[]>([]);
  // 有缓存时 loading 直接从 false 开始，避免骨架屏闪烁
  const [loading, setLoading] = useState(() => !readEmployeeCache());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [dataSynced, setDataSynced] = useState(false);
  const [authStep, setAuthStep] = useState<string | null>(null);
  const dataSyncAttemptRef = useRef(0);
  const lastSyncedUserIdRef = useRef<string | null>(null);
  const isSyncingRef = useRef(false);
  const initCompletedRef = useRef(!!readEmployeeCache()); // 有缓存则视为已完成初始化
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
      console.log('[AuthContext] Dev environment detected, skipping IP validation');
      return true;
    }
    
    isValidatingIpRef.current = true;
    
    try {
      const result = await checkIpAccess();
      
      // 后端已跳过校验（开发环境或功能未启用）
      if (result.skipped) {
        console.log('[AuthContext] IP validation skipped by backend:', result.reason);
        return true;
      }
      
      if (!result.valid) {
        console.warn('[AuthContext] IP country validation failed:', result);
        
        if (forceLogout && session) {
          // 显示错误提示
          toast.error(result.message || '您的IP地址不在允许的地区范围内', {
            duration: 10000,
            description: `IP: ${result.ip || 'unknown'}, 国家: ${result.country_name || result.country_code || 'unknown'}`,
          });
          
          // 强制登出
          await logoutApi();
          setUser(null);
          setSession(null);
          writeEmployeeCache(null);
          setEmployee(null);
          clearOperatorCache();
          
          // 跳转到员工登录页
          window.location.href = '/staff/login';
        }
        
        return false;
      }
      
      console.log('[AuthContext] IP validation passed:', result.country_code, result.city);
      return true;
    } catch (error) {
      console.error('[AuthContext] IP validation error:', error);
      // 验证出错时，出于安全考虑，也强制登出
      if (forceLogout && session) {
        toast.error('IP验证服务异常，请重新登录');
        await logoutApi();
        window.location.href = '/staff/login';
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
        console.log('[AuthContext] Periodic IP validation...');
        performIpValidation(true);
      }
    }, IP_VALIDATION_INTERVAL);
    
    console.log('[AuthContext] IP validation interval started');
  }, [session, employee, performIpValidation]);

  // 停止定期 IP 校验
  const stopIpValidationInterval = useCallback(() => {
    if (ipValidationIntervalRef.current) {
      clearInterval(ipValidationIntervalRef.current);
      ipValidationIntervalRef.current = null;
      console.log('[AuthContext] IP validation interval stopped');
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
      Promise.all([
        queryClient.prefetchQuery({ queryKey: ['employees'], queryFn: () => fetchEmployeesFromDb(null) }),
        queryClient.prefetchQuery({ queryKey: ['cards'], queryFn: fetchCardsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['vendors'], queryFn: fetchVendorsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['payment-providers'], queryFn: fetchPaymentProvidersFromDb }),
        queryClient.prefetchQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypesFromDb }),
        queryClient.prefetchQuery({ queryKey: ['members', null], queryFn: () => fetchMembersFromDb(null, true) }),
      ]).catch(err => console.error('Prefetch failed:', err));
    } finally {
      clearTimeout(timeoutId);
      setDataSynced(true);
      isSyncingRef.current = false;
      window.dispatchEvent(new Event('userDataSynced'));
    }
  }, []);

  // 加载权限数据 - 通过 API 获取
  const loadPermissions = useCallback(async () => {
    try {
      const { getRolePermissions } = await import('@/api/data');
      const data = await getRolePermissions();
      setPermissions(data || []);
      setPermissionsLoaded(true);
      console.log('[AuthContext] Permissions loaded:', data?.length || 0);
    } catch (error) {
      console.error('[AuthContext] Failed to load permissions:', error);
      setPermissionsLoaded(true);
    }
  }, []);

  // 刷新员工信息（供外部调用）
  const refreshEmployee = useCallback(async () => {
    const authUser = await getCurrentUserApi();
    if (authUser) {
      const tenantId = authUser.is_platform_super_admin ? null : (authUser.tenant_id ?? null);
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
        return;
      }
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('api_access_token') : null;
      console.log('[Auth] token', token ? `${token.slice(0, 20)}...` : null);
      getCurrentUserApi().then((authUser) => {
        if (!isMounted) return;
        console.log('[Auth] current user from /me', authUser ? authUser.username : null);
        if (authUser) {
          // 平台总管理 ≠ 租户账号：tenant_id 强制为 null，严格区分
          const tenantId = authUser.is_platform_super_admin ? null : (authUser.tenant_id ?? null);
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

  // 加载权限并轮询更新（替代 Realtime 订阅）
  useEffect(() => {
    if (!employee) return;
    loadPermissions();
    const interval = setInterval(loadPermissions, 60 * 1000);
    return () => clearInterval(interval);
  }, [employee, loadPermissions]);

  // IP 国家校验 - 用户登录后和会话恢复时触发
  useEffect(() => {
    if (session && employee && !loading) {
      // 会话恢复后验证 IP
      console.log('[AuthContext] Session restored, validating IP country...');
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
  const signIn = async (username: string, password: string): Promise<{ success: boolean; message: string; user?: EmployeeInfo }> => {
    const normalizedUsername = username.trim();
    try {
      setAuthStep('验证账号...');

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
            return { success: false, message: `请求过于频繁，请${retryMin}分钟后再试` };
          }
        } catch (_) {}

        try {
          setAuthStep('验证访问区域...');
          const ipValidation = await checkIpAccess();
          if (!ipValidation.skipped && !ipValidation.valid) {
            setAuthStep(null);
            return {
              success: false,
              message: ipValidation.message || `访问被拒绝：您的IP (${ipValidation.ip}) 不在允许的地区范围内`,
            };
          }
        } catch (_) {}
      }

      setAuthStep('连接认证服务...');
      const result = await withTimeout(
        loginApi(normalizedUsername, password),
        TIMEOUT.AUTH,
        '登录超时，请检查网络'
      );

      if (!result.success) {
        setAuthStep(null);
        return { success: false, message: result.message || '登录失败' };
      }

      const authUser = result.user!;
      const tenantId = authUser.is_platform_super_admin ? null : (authUser.tenant_id ?? null);
      setSharedDataTenantId(tenantId);
      const empInfo: EmployeeInfo = {
        id: authUser.id,
        username: authUser.username,
        real_name: authUser.real_name,
        role: authUser.role,
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
      preloadSharedData().catch(console.error);
      initializeReferralCache().catch(console.error);
      syncUserData(authUser.id).catch(console.error);

      skipNextInitAuthCheckRef.current = true; // 避免 init 重跑时再次请求 /me 导致竞态
      setLoading(false);
      setDataSynced(true);
      initCompletedRef.current = true;
      setAuthStep(null);
      return { success: true, message: `欢迎回来，${authUser.real_name}！`, user: empInfo };
    } catch (error: any) {
      console.error('Sign in error:', error);
      setAuthStep(null);
      if (error?.message?.includes('超时')) {
        return { success: false, message: error.message };
      }
      return { success: false, message: error?.message || '登录失败' };
    }
  };

  const signOut = async () => {
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
    
    console.log('[AuthContext] Sign out complete, all caches cleared');
  };

  const updateEmployeeLocal = (patch: Partial<EmployeeInfo>) => {
    setEmployee((prev) => {
      const next = prev ? { ...prev, ...patch } : prev;
      writeEmployeeCache(next);
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
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
        isAuthenticated: !!session && !!employee,
        isEmployeeAuthenticated: !!session && userType === 'employee' && !!employee,
        isMemberAuthenticated: !!session && userType === 'member',
        isAdmin: employee?.role === 'admin',
        isManager: employee?.role === 'admin' || employee?.role === 'manager',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
