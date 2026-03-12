/**
 * 会员端认证上下文
 * 与员工 AuthContext 隔离，会员通过手机号+密码登录
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  wallet_balance: number;
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
      const { data, error } = await supabase.rpc('verify_member_password', {
        p_phone: phone.trim(),
        p_password: password,
      });
      if (error) {
        return { success: false, message: error.message };
      }
      const result = data as { success: boolean; error?: string; member?: MemberInfo };
      if (!result.success) {
        const msg = result.error === 'MEMBER_NOT_FOUND' ? 'Member not found'
          : result.error === 'NO_PASSWORD_SET' ? 'Please contact admin to set your password'
          : result.error === 'WRONG_PASSWORD' ? 'Wrong password'
          : result.error || 'Login failed';
        return { success: false, message: msg };
      }
      if (result.member) {
        const m: MemberInfo = {
          id: result.member.id,
          member_code: result.member.member_code,
          phone_number: result.member.phone_number,
          nickname: result.member.nickname ?? null,
          member_level: result.member.member_level ?? null,
          wallet_balance: Number(result.member.wallet_balance) || 0,
        };
        setMember(m);
        saveSession(m);
        return { success: true, message: 'Welcome back!' };
      }
      return { success: false, message: 'Invalid response' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  }, []);

  const signOut = useCallback(() => {
    setMember(null);
    saveSession(null);
  }, []);

  const setPassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!member) return { success: false, message: 'Not logged in' };
    try {
      const { data, error } = await supabase.rpc('set_member_password', {
        p_member_id: member.id,
        p_old_password: oldPassword || null,
        p_new_password: newPassword,
      });
      if (error) return { success: false, message: error.message };
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        const msg = result.error === 'WRONG_PASSWORD' ? 'Wrong password'
          : result.error === 'PASSWORD_TOO_SHORT' ? 'Password must be at least 6 characters'
          : result.error || 'Failed';
        return { success: false, message: msg };
      }
      return { success: true, message: 'Password updated' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Network error' };
    }
  }, [member]);

  const refreshMember = useCallback(async () => {
    if (!member) return;
    try {
      const { data, error } = await supabase.rpc('member_get_info', { p_member_id: member.id });
      if (error) return;
      const r = data as { success?: boolean; member?: MemberInfo };
      if (r?.success && r?.member) {
        const m: MemberInfo = {
          id: r.member.id,
          member_code: r.member.member_code,
          phone_number: r.member.phone_number,
          nickname: r.member.nickname ?? null,
          member_level: r.member.member_level ?? null,
          wallet_balance: Number(r.member.wallet_balance) || 0,
        };
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
