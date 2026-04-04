/**
 * 会员端认证上下文
 * 与员工 AuthContext 隔离，会员通过手机号+密码登录
 * 数据通过 @/services/memberPortal/memberAuthService 获取，禁止直接访问 Supabase
 *
 * 登录态真源：JWT（member_access_token）。member_session（localStorage）仅为展示用资料缓存（不含密码），
 * 不作为权限或业务真源；无 token 时必须视为未登录。
 * 退出：清 token、清 session、清门户展示缓存（见 clearMemberPortalSettingsBrowserCaches）、removeQueries。
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { memberSignIn, memberSetPassword, memberGetInfo, isMustChangePasswordResult } from '@/services/memberPortal/memberAuthService';
import {
  setMemberAccessToken,
  clearMemberAccessToken,
  MEMBER_ACCESS_TOKEN_KEY,
  ApiError,
} from '@/lib/apiClient';
import { clearMemberPortalSettingsBrowserCaches } from '@/lib/memberPortalBrowserCache';
import { queryClient } from '@/lib/queryClient';
import { memberQueryKeys } from '@/lib/memberQueryKeys';
import { clearMallCatalogCache } from '@/lib/mallCatalogCache';

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  /** 等级中文名（后台规则表配置） */
  member_level_zh?: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
  avatar_url?: string | null;
  /** 为 true 时须先完成改密才能进入会员业务页 */
  must_change_password?: boolean;
  invite_success_lifetime_count?: number;
  /** 累计因邀请获得的抽奖次数（来自 spin_credits 历史，不随设置变动） */
  invite_lifetime_reward_spins?: number;
  lifetime_reward_points_earned?: number;
  total_points?: number;
}

/** 会员资料展示缓存（非鉴权真源；鉴权以 MEMBER_ACCESS_TOKEN_KEY 为准） */
const STORAGE_KEY = 'member_session';

interface MemberAuthContextType {
  member: MemberInfo | null;
  loading: boolean;
  signIn: (
    phone: string,
    password: string,
  ) => Promise<{ success: boolean; message: string; mustChangePassword?: boolean; code?: string }>;
  signOut: () => void;
  setPassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  refreshMember: () => Promise<void>;
  isAuthenticated: boolean;
}

const MemberAuthContext = createContext<MemberAuthContextType | undefined>(undefined);

function loadStoredSession(): MemberInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MemberInfo;
  } catch {
    return null;
  }
}

function saveSession(m: MemberInfo | null) {
  if (m) localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  else localStorage.removeItem(STORAGE_KEY);
}

function loadInitialMemberState(): MemberInfo | null {
  const m = loadStoredSession();
  if (
    m?.id &&
    typeof localStorage !== 'undefined' &&
    !localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY)
  ) {
    saveSession(null);
    return null;
  }
  return m;
}

/**
 * 检查会员 JWT 是否存在且未过期（只解码 payload，不验签）。
 * 过期时主动清除 token，避免用户停留在页面上、点击操作时才被踢到登录页。
 */
function readMemberTokenPresent(): boolean {
  try {
    const token = localStorage.getItem(MEMBER_ACCESS_TOKEN_KEY);
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1]));
      if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(MEMBER_ACCESS_TOKEN_KEY);
        return false;
      }
    } catch {
      // malformed token — treat as present and let backend decide
    }
    return true;
  } catch {
    return false;
  }
}

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<MemberInfo | null>(() => loadInitialMemberState());
  /** 首次挂载时若存在缓存会话，需向服务端校验一次有效性 */
  const [sessionVerifying, setSessionVerifying] = useState(() => {
    const cached = loadInitialMemberState();
    return Boolean(cached?.id && readMemberTokenPresent());
  });
  /** 与 token / 跨 tab 同步联动，驱动 isAuthenticated 重算 */
  const [authTick, setAuthTick] = useState(0);
  const bumpAuth = useCallback(() => setAuthTick((t) => t + 1), []);

  useEffect(() => {
    const onSessionClear = () => {
      setMember(null);
      saveSession(null);
      bumpAuth();
    };
    window.addEventListener('member:session-clear', onSessionClear);
    return () => window.removeEventListener('member:session-clear', onSessionClear);
  }, [bumpAuth]);

  useEffect(() => {
    const onMustChange = () => {
      setMember((prev) => {
        if (!prev) return prev;
        const next = { ...prev, must_change_password: true };
        saveSession(next);
        return next;
      });
      bumpAuth();
    };
    window.addEventListener('member:must-change-password', onMustChange);
    return () => window.removeEventListener('member:must-change-password', onMustChange);
  }, [bumpAuth]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MEMBER_ACCESS_TOKEN_KEY) return;
      if (!e.newValue) {
        setMember(null);
        saveSession(null);
        clearMallCatalogCache();
        bumpAuth();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [bumpAuth]);

  const signIn = useCallback(async (phone: string, password: string) => {
    try {
      const result = await memberSignIn(phone, password);
      if (!result.success) return { success: false, message: result.message, code: result.code };
      if (result.member && result.token) {
        clearMallCatalogCache();
        try { window.dispatchEvent(new CustomEvent('member:signout')); } catch { /* clear page caches on account switch */ }
        setMember(result.member);
        saveSession(result.member);
        setMemberAccessToken(result.token);
        bumpAuth();
        return {
          success: true,
          message: 'Welcome back!',
          mustChangePassword: !!result.member.must_change_password,
        };
      }
      return { success: false, message: 'Invalid response', code: 'INVALID_RESPONSE' };
    } catch (e: unknown) {
      return { success: false, message: (e as Error)?.message || 'Network error' };
    }
  }, [bumpAuth]);

  const signOut = useCallback(() => {
    setMember(null);
    saveSession(null);
    clearMemberAccessToken();
    bumpAuth();
    clearMemberPortalSettingsBrowserCaches();
    clearMallCatalogCache();
    try { localStorage.removeItem("member_saved_credentials"); } catch { /* storage unavailable */ }
    try { sessionStorage.removeItem("member_splash_shown"); } catch { /* storage unavailable */ }
    queryClient.removeQueries({ queryKey: [...memberQueryKeys.all] });
    try { window.dispatchEvent(new CustomEvent('member:signout')); } catch { /* ignore */ }
  }, [bumpAuth]);

  const setPassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!member) return { success: false, message: 'Not logged in' };
    const result = await memberSetPassword(member.id, oldPassword, newPassword);
    if (!result.success) return { success: false, message: result.message };
    if (result.token) setMemberAccessToken(result.token);
    if (result.member) {
      setMember(result.member);
      saveSession(result.member);
    } else {
      const m = await memberGetInfo(member.id);
      if (m) {
        setMember(m);
        saveSession(m);
      }
    }
    bumpAuth();
    return { success: true, message: result.message };
  }, [member, bumpAuth]);

  const refreshMember = useCallback(async () => {
    if (!member) return;
    if (!readMemberTokenPresent()) {
      setMember(null);
      saveSession(null);
      bumpAuth();
      return;
    }
    try {
      const m = await memberGetInfo(member.id);
      if (isMustChangePasswordResult(m)) {
        // Server says must change password — keep session, don't logout
        return;
      }
      if (m) {
        setMember(m);
        saveSession(m);
      } else {
        setMember(null);
        saveSession(null);
        clearMemberAccessToken();
        bumpAuth();
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setMember(null);
        saveSession(null);
        clearMemberAccessToken();
        bumpAuth();
      }
    }
  }, [member, bumpAuth]);

  useEffect(() => {
    if (!sessionVerifying) return;
    const cachedMember = loadInitialMemberState();
    if (!cachedMember?.id || !readMemberTokenPresent()) {
      setSessionVerifying(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setSessionVerifying(false);
    }, 1500);
    memberGetInfo(cachedMember.id)
      .then((serverMember) => {
        if (cancelled) return;
        if (isMustChangePasswordResult(serverMember)) {
          // Keep cached session — user will be directed to change password
          setMember(cachedMember);
          return;
        }
        if (serverMember) {
          setMember(serverMember);
          saveSession(serverMember);
        } else {
          setMember(null);
          saveSession(null);
          clearMemberAccessToken();
          bumpAuth();
        }
      })
      .catch(() => {
        // network error — keep cached session, don't block
      })
      .finally(() => {
        if (!cancelled) setSessionVerifying(false);
      });
    return () => { cancelled = true; clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodically re-check JWT expiry and server-side session validity
  useEffect(() => {
    const id = setInterval(() => {
      if (!member?.id) return;
      if (!readMemberTokenPresent()) {
        setMember(null);
        saveSession(null);
        bumpAuth();
        return;
      }
      memberGetInfo(member.id)
        .then((serverMember) => {
          if (isMustChangePasswordResult(serverMember)) return;
          if (!serverMember) {
            setMember(null);
            saveSession(null);
            clearMemberAccessToken();
            bumpAuth();
          }
        })
        .catch(() => { /* network error — keep current session */ });
    }, 60_000);
    return () => clearInterval(id);
  }, [member?.id, bumpAuth]);

  const isAuthenticated = useMemo(() => {
    void authTick; // force recalculation when token state changes
    if (!member?.id) return false;
    return readMemberTokenPresent();
  }, [member, authTick]);

  return (
    <MemberAuthContext.Provider
      value={{
        member,
        loading: sessionVerifying,
        signIn,
        signOut,
        setPassword,
        refreshMember,
        isAuthenticated,
      }}
    >
      {children}
    </MemberAuthContext.Provider>
  );
}

export function useMemberAuth() {
  const ctx = useContext(MemberAuthContext);
  if (ctx === undefined) throw new Error('useMemberAuth must be used within MemberAuthProvider');
  return ctx;
}
