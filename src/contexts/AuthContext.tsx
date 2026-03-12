import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/stores/employeeStore';
import { preloadSharedData, ensureDefaultSharedData } from '@/services/sharedDataService';
import { initializeReferralCache } from '@/stores/referralStore';
import { setOperatorCache, clearOperatorCache } from '@/services/operatorService';
import { initNameResolver, resetNameResolver } from '@/services/nameResolver';
import { initializeUserDataSync } from '@/services/userDataSyncService';
import { syncAuthPassword, type AuthPasswordSyncResult } from '@/services/authPasswordSyncService';
import { withTimeout, TIMEOUT } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { cleanupCacheManager } from '@/services/cacheManager';
import { resetReferralCache } from '@/stores/referralStore';
import { resetPointsSettingsCache } from '@/stores/pointsSettingsStore';
import { queryClient } from '@/lib/queryClient';
import { fetchEmployeesFromDb } from '@/hooks/useEmployees';
import { fetchCardsFromDb, fetchVendorsFromDb, fetchPaymentProvidersFromDb } from '@/hooks/useMerchantConfig';
import { fetchActivityTypesFromDb } from '@/hooks/useActivityTypes';

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

// 读取 data_settings 中的 IP 访问控制配置，决定是否执行国家校验
async function checkIpAccess(): Promise<IpValidationResult> {
  try {
    const { data: ipSetting } = await supabase
      .from('data_settings')
      .select('setting_value')
      .eq('setting_key', 'ip_access_control')
      .maybeSingle();

    const config = ipSetting?.setting_value as { enabled?: boolean } | null;
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

// 记录登录日志（支持成功和失败）
async function logLoginAttempt(
  employeeId: string, 
  success: boolean, 
  failureReason?: string,
  clientIp?: string | null
) {
  try {
    const userAgent = navigator.userAgent;
    
    // 如果没有提供IP，尝试获取
    const ipAddress = clientIp ?? await getClientIp();
    
    await (supabase.rpc as any)('log_employee_login', {
      p_employee_id: employeeId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_success: success,
      p_failure_reason: failureReason || null,
    });
    
    console.log('[AuthContext] Login logged:', { employeeId, success, ipAddress });
  } catch (error) {
    console.error('Failed to log login attempt:', error);
  }
}

interface EmployeeInfo {
  id: string;
  username: string;
  real_name: string;
  role: AppRole;
  status: string;
  is_super_admin: boolean;
  /** 是否为平台总管理员（platform 租户 + is_super_admin），区分于租户总管理员 */
  is_platform_super_admin?: boolean;
  /** 所属租户 ID，用于共享数据隔离 */
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

interface AuthContextType {
  user: User | null;
  session: Session | null;
  employee: EmployeeInfo | null;
  permissions: RolePermissionRecord[];
  loading: boolean;
  permissionsLoaded: boolean;
  dataSynced: boolean;
  authStep: string | null;
  signIn: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  updateEmployeeLocal: (patch: Partial<EmployeeInfo>) => void;
  refreshEmployee: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 数据同步超时时间
const DATA_SYNC_TIMEOUT = 10000;
// 初始化最大超时时间（防止永久卡死）
const AUTH_INIT_TIMEOUT = 8000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [permissions, setPermissions] = useState<RolePermissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [dataSynced, setDataSynced] = useState(false);
  const [authStep, setAuthStep] = useState<string | null>(null);
  const dataSyncAttemptRef = useRef(0);
  const lastSyncedUserIdRef = useRef<string | null>(null);
  const isSyncingRef = useRef(false);
  const initCompletedRef = useRef(false);
  const ipValidationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isValidatingIpRef = useRef(false);

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
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setEmployee(null);
          clearOperatorCache();
          
          // 跳转到登录页
          window.location.href = '/login';
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
        await supabase.auth.signOut();
        window.location.href = '/login';
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
        queryClient.prefetchQuery({ queryKey: ['employees'], queryFn: fetchEmployeesFromDb }),
        queryClient.prefetchQuery({ queryKey: ['cards'], queryFn: fetchCardsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['vendors'], queryFn: fetchVendorsFromDb }),
        queryClient.prefetchQuery({ queryKey: ['payment-providers'], queryFn: fetchPaymentProvidersFromDb }),
        queryClient.prefetchQuery({ queryKey: ['activity-types'], queryFn: fetchActivityTypesFromDb }),
      ]).catch(err => console.error('Prefetch failed:', err));
    } finally {
      clearTimeout(timeoutId);
      setDataSynced(true);
      isSyncingRef.current = false;
      window.dispatchEvent(new Event('userDataSynced'));
    }
  }, []);

  // 加载权限数据
  const loadPermissions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*');

      if (error) throw error;
      setPermissions(data || []);
      setPermissionsLoaded(true);
      console.log('[AuthContext] Permissions loaded:', data?.length || 0);
    } catch (error) {
      console.error('[AuthContext] Failed to load permissions:', error);
      setPermissionsLoaded(true); // 即使失败也标记为已加载，避免无限等待
    }
  }, []);

  // 获取员工信息 - 返回成功/失败状态
  const fetchEmployeeInfo = useCallback(async (userId: string): Promise<boolean> => {
    try {
      // Get profile with employee_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('employee_id')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('Profile query error:', profileError);
        return false;
      }
      
      if (!profile?.employee_id) {
        console.warn('[AuthContext] No employee_id in profile, user may need re-login');
        return false;
      }

      // Get employee info（优先使用 RPC 获取 is_platform_super_admin，区分平台/租户总管理员）
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_employee_info');
      let emp: any;
      if (!rpcError && rpcData && (Array.isArray(rpcData) ? rpcData[0] : rpcData)) {
        emp = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      }
      if (!emp) {
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select('id, username, real_name, role, status, is_super_admin, tenant_id')
          .eq('id', profile.employee_id)
          .single();
        if (empError || !empData) {
          console.error('Error fetching employee:', empError);
          return false;
        }
        emp = empData;
      }

      const empInfo: EmployeeInfo = {
        id: emp.id,
        username: emp.username,
        real_name: emp.real_name,
        role: emp.role as AppRole,
        status: emp.status,
        is_super_admin: emp.is_super_admin ?? false,
        is_platform_super_admin: emp.is_platform_super_admin ?? false,
        tenant_id: emp.tenant_id ?? null,
      };
      
      setEmployee(empInfo);
      
      // Update web vitals employee tracking
      import('@/services/webVitalsService').then(m => m.setWebVitalsEmployee(emp.id)).catch(() => {});
      
      // 更新全局操作员缓存
      setOperatorCache({
        id: emp.id,
        account: emp.username,
        role: emp.role,
        realName: emp.real_name,
      });
      
      return true;
    } catch (error) {
      console.error('Error in fetchEmployeeInfo:', error);
      return false;
    }
  }, []);

  // 刷新员工信息（供外部调用）
  const refreshEmployee = useCallback(async () => {
    if (user?.id) {
      await fetchEmployeeInfo(user.id);
    }
  }, [user?.id, fetchEmployeeInfo]);

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

    // 设置 auth 状态监听器 - 回调必须是同步的！
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        // 同步更新状态
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // 使用 setTimeout 延迟数据库调用，避免死锁
          setTimeout(() => {
            if (isMounted) {
              fetchEmployeeInfo(session.user.id);
              syncUserData(session.user.id);
            }
          }, 0);
        } else {
          // 清空状态
          setEmployee(null);
          setPermissions([]);
          setPermissionsLoaded(false);
          setDataSynced(false);
          lastSyncedUserIdRef.current = null;
          dataSyncAttemptRef.current = 0;
          isSyncingRef.current = false;
        }
      }
    );

    // 获取现有会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // 异步获取员工信息，但不阻塞 loading 状态
        fetchEmployeeInfo(session.user.id).finally(() => {
          if (isMounted && !initCompletedRef.current) {
            setLoading(false);
            initCompletedRef.current = true;
          }
        });
        syncUserData(session.user.id);
      } else {
        // 无会话时立即完成初始化
        setDataSynced(true);
        if (!initCompletedRef.current) {
          setLoading(false);
          initCompletedRef.current = true;
        }
      }
    }).catch((error) => {
      console.error('[AuthContext] getSession error:', error);
      if (isMounted && !initCompletedRef.current) {
        setLoading(false);
        setDataSynced(true);
        initCompletedRef.current = true;
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(initTimeoutId);
      subscription.unsubscribe();
    };
  }, [fetchEmployeeInfo, syncUserData]);

  // 订阅权限变更 (Realtime)
  useEffect(() => {
    if (!employee) return;

    // 初始加载权限
    loadPermissions();

    // 订阅权限表变更
    const channel = supabase
      .channel('auth-permissions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => {
        console.log('[AuthContext] Permissions changed, reloading...');
        loadPermissions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
  const signIn = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    // 预先获取IP地址（不阻塞登录流程）
    const ipPromise = getClientIp();
    
    try {
      // 步骤1：验证员工账号
      setAuthStep('验证账号...');
      
      let verifyResult: any[] | null = null;
      let verifyError: any = null;
      
      try {
        const response = await withTimeout(
          supabase.rpc('verify_employee_login_detailed', {
            p_username: username,
            p_password: password
          }),
          TIMEOUT.RPC,
          '验证账号超时，请检查网络'
        );
        verifyResult = response.data;
        verifyError = response.error;
      } catch (err: any) {
        setAuthStep(null);
        return { success: false, message: err.message || '验证账号超时，请检查网络' };
      }

      if (verifyError) {
        console.error('Verify error:', verifyError);
        setAuthStep(null);
        return { success: false, message: '系统繁忙，请稍后重试' };
      }

      if (!verifyResult || verifyResult.length === 0) {
        setAuthStep(null);
        return { success: false, message: '验证失败，请稍后重试' };
      }

      const result = verifyResult[0];
      const clientIp = await ipPromise;
      
      // 根据错误代码返回具体提示，并记录失败日志
      if (result.error_code) {
        setAuthStep(null);
        
        // 记录失败的登录尝试
        // 对于 USER_NOT_FOUND，我们没有 employee_id，所以需要特殊处理
        if (result.error_code === 'WRONG_PASSWORD' && result.employee_id) {
          // 密码错误时可以记录到对应员工
          logLoginAttempt(result.employee_id, false, '密码错误', clientIp).catch(console.error);
        } else if (result.error_code === 'ACCOUNT_DISABLED' && result.employee_id) {
          logLoginAttempt(result.employee_id, false, '账号已禁用', clientIp).catch(console.error);
        }
        // USER_NOT_FOUND 没有 employee_id，无法记录到特定用户
        
        switch (result.error_code) {
          case 'USER_NOT_FOUND':
            return { success: false, message: '账号不存在，请检查用户名或去注册' };
          case 'WRONG_PASSWORD':
            return { success: false, message: '密码错误，请重新输入' };
          case 'ACCOUNT_DISABLED':
            return { success: false, message: '账号已被禁用，请联系管理员' };
          default:
            return { success: false, message: '登录失败，请稍后重试' };
        }
      }

      // 从 RPC 返回结果构建 emp 对象（含 tenant_id，供租户员工登录后立即显示数据）
      const emp = {
        employee_id: result.employee_id,
        username: result.username,
        real_name: result.real_name,
        role: result.role,
        status: result.status,
        is_super_admin: result.is_super_admin ?? false,
        tenant_id: result.tenant_id ?? null,
      };
      
      // 检查账号状态
      if (emp.status === 'pending') {
        setAuthStep(null);
        logLoginAttempt(emp.employee_id, false, '账号待审批', clientIp).catch(console.error);
        return { success: false, message: '账号正在等待管理员审批，请耐心等待' };
      }
      
      if (emp.status !== 'active') {
        setAuthStep(null);
        logLoginAttempt(emp.employee_id, false, '账号状态异常: ' + emp.status, clientIp).catch(console.error);
        return { success: false, message: '账号已被禁用，请联系管理员' };
      }

      // ========== 步骤2：IP 国家校验 ==========
      setAuthStep('验证访问区域...');
      
      const ipValidation = await checkIpAccess();
      
      // 检查是否被后端跳过（开发环境）
      if (ipValidation.skipped) {
        console.log('[AuthContext] IP validation skipped by backend:', ipValidation.reason);
      } else if (!ipValidation.valid) {
        // 非生产环境：记录日志但允许登录
        if (!isProductionEnvironment()) {
          console.warn('[AuthContext] IP validation failed but dev mode, allowing login:', ipValidation);
        } else {
          // 生产环境：阻止登录
          setAuthStep(null);
          logLoginAttempt(emp.employee_id, false, `IP国家限制: ${ipValidation.country_code || 'unknown'}`, clientIp).catch(console.error);
          return { 
            success: false, 
            message: ipValidation.message || `访问被拒绝：您的IP (${ipValidation.ip}) 不在允许的地区范围内` 
          };
        }
      } else {
        console.log('[AuthContext] IP validation passed:', ipValidation.country_code, ipValidation.city);
      }

      // Generate email for Supabase auth (username@system.local)
      const email = `${username}@system.local`;
      
      // 步骤3：尝试登录认证系统
      setAuthStep('连接认证服务...');
      
       let { data: signInData, error: signInError } = await withTimeout(
         supabase.auth.signInWithPassword({
           email,
           password,
         }),
         TIMEOUT.AUTH,
         '登录超时，请检查网络'
       );

       // 认证系统密码与员工表密码不同步时：自动同步（或创建）后重试登录
       if (signInError?.message?.includes('Invalid login credentials')) {
         setAuthStep('同步认证密码...');

         const syncResult = await withTimeout<AuthPasswordSyncResult>(
           syncAuthPassword(username, password),
           TIMEOUT.AUTH,
           '同步认证密码超时'
         ).catch((err) => ({ success: false, message: err?.message || '同步失败' }));

         if (!syncResult?.success) {
           setAuthStep(null);
           return { success: false, message: syncResult?.message || '认证服务同步失败，请联系平台管理员重置密码' };
         }

         // 同步成功后重试登录（Auth 服务可能需短暂传播时间）
         setAuthStep('重新登录...');
         const retry = await withTimeout(
           supabase.auth.signInWithPassword({
             email,
             password,
           }),
           TIMEOUT.AUTH,
           '登录超时，请检查网络'
         );

         signInData = retry.data;
         signInError = retry.error;

         // 若首次重试仍失败，等待 2 秒后再次重试（应对 Auth 传播延迟）
         if (signInError?.message?.includes('Invalid login credentials')) {
           await new Promise((r) => setTimeout(r, 2000));
           const retry2 = await withTimeout(
             supabase.auth.signInWithPassword({ email, password }),
             TIMEOUT.AUTH,
             '登录超时，请检查网络'
           );
           signInData = retry2.data;
           signInError = retry2.error;
         }
       }

       if (signInError) {
         setAuthStep(null);
         return { success: false, message: '登录失败: ' + signInError.message };
       }

      // 步骤4：确保现有用户也有 profile 关联
      setAuthStep('同步账号信息...');
      
      if (signInData.user) {
        try {
          await withTimeout(
            supabase
              .from('profiles')
              .upsert({ 
                id: signInData.user.id, 
                employee_id: emp.employee_id,
                email: email 
              }, { onConflict: 'id' }),
            TIMEOUT.PROFILE,
            '同步账号超时'
          );
        } catch (linkError) {
          console.error('Link profile error:', linkError);
          // 不阻塞登录流程
        }
      }

      // Update employee info（含 tenant_id，租户员工登录后立即有 effectiveTenantId）
      const employeeInfo: EmployeeInfo = {
        id: emp.employee_id,
        username: emp.username,
        real_name: emp.real_name,
        role: emp.role,
        status: emp.status,
        is_super_admin: emp.is_super_admin ?? false,
        tenant_id: emp.tenant_id ?? null,
      };
      setEmployee(employeeInfo);
      
      // 更新全局操作员缓存
      setOperatorCache({
        id: emp.employee_id,
        account: emp.username,
        role: emp.role,
        realName: emp.real_name,
      });
      
      // 初始化共享数据缓存（异步，不阻塞）
      preloadSharedData().catch(console.error);
      initializeReferralCache().catch(console.error);
      
      // 记录登录日志（包含IP）
      logLoginAttempt(emp.employee_id, true, undefined, clientIp).catch(console.error);

      setAuthStep(null);
      return { success: true, message: `欢迎回来，${emp.real_name}！` };
    } catch (error: any) {
      console.error('Sign in error:', error);
      setAuthStep(null);
      
      if (error.message?.includes('超时')) {
        return { success: false, message: error.message };
      }
      return { success: false, message: '登录失败: ' + error.message };
    }
  };

  const signOut = async () => {
    // 1. 停止 IP 校验定时器
    stopIpValidationInterval();
    
    // 2. 退出认证
    await supabase.auth.signOut();
    
    // 3. 清空组件状态
    setUser(null);
    setSession(null);
    setEmployee(null);
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
    setEmployee((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        employee,
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
