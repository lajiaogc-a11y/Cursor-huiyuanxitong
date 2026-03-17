/**
 * 会员端认证上下文
 * 与员工 AuthContext 隔离，会员通过手机号+密码登录
 * 数据通过 @/api/memberAuth 获取，禁止直接访问 Supabase
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { memberSignIn, memberSetPassword, memberGetInfo } from '@/api/memberAuth';
import { getMaintenanceModeStatusResult } from '@/services/maintenanceModeService';

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
}

const STORAGE_KEY = 'member_session';

interface MemberAuthContextType {
  member: MemberInfo | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<{ success: boolean; message: string }>;
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

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<MemberInfo | null>(loadStoredSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMember(loadStoredSession());
    setLoading(false);
  }, []);

  const signIn = useCallback(async (phone: string, password: string) => {
    try {
      const result = await memberSignIn(phone, password);
      if (!result.success) return { success: false, message: result.message };
      if (result.member) {
        const tenantId = result.member.tenant_id ?? null;
        const maintenanceStatus = await getMaintenanceModeStatusResult(tenantId);
        if (maintenanceStatus.ok && maintenanceStatus.data.effectiveEnabled) {
          const message =
            maintenanceStatus.data.scope === 'global'
              ? (maintenanceStatus.data.globalMessage || 'System is under maintenance, please try later')
              : (maintenanceStatus.data.tenantMessage || 'Tenant is under maintenance, please try later');
          return { success: false, message };
        }
        setMember(result.member);
        saveSession(result.member);
        return { success: true, message: 'Welcome back!' };
      }
      return { success: false, message: 'Invalid response' };
    } catch (e: unknown) {
      return { success: false, message: (e as Error)?.message || 'Network error' };
    }
  }, []);

  const signOut = useCallback(() => {
    setMember(null);
    saveSession(null);
  }, []);

  const setPassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!member) return { success: false, message: 'Not logged in' };
    return memberSetPassword(member.id, oldPassword, newPassword);
  }, [member]);

  const refreshMember = useCallback(async () => {
    if (!member) return;
    try {
      const m = await memberGetInfo(member.id);
      if (m) {
        setMember(m);
        saveSession(m);
      }
    } catch {
      // ignore
    }
  }, [member?.id]);

  return (
    <MemberAuthContext.Provider
      value={{
        member,
        loading,
        signIn,
        signOut,
        setPassword,
        refreshMember,
        isAuthenticated: !!member,
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
