/**
 * 员工端：会员管理相关 RPC
 */
import { memberAdminApi } from "@/api/memberAdmin";

export type AdminSetMemberPasswordResult = {
  success?: boolean;
  error?: string;
};

export async function adminSetMemberInitialPassword(memberId: string, newPassword: string): Promise<AdminSetMemberPasswordResult> {
  return memberAdminApi.setInitialPassword(memberId, newPassword) as Promise<AdminSetMemberPasswordResult>;
}

export async function adminGetMemberReferrals(memberId: string): Promise<{ success?: boolean; referrals?: unknown[] }> {
  return memberAdminApi.getReferrals(memberId) as Promise<{ success?: boolean; referrals?: unknown[] }>;
}

export async function adminGetInitialPassword(memberId: string): Promise<string | null> {
  try {
    const res = await memberAdminApi.getInitialPassword(memberId) as { password?: string };
    return res?.password || null;
  } catch {
    return null;
  }
}
