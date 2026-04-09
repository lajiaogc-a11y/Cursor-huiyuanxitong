/**
 * 员工端：会员管理相关 RPC
 */
import { dataRpcApi } from "@/api/data";

export type AdminSetMemberPasswordResult = {
  success?: boolean;
  error?: string;
};

export async function adminSetMemberInitialPassword(memberId: string, newPassword: string): Promise<AdminSetMemberPasswordResult> {
  return dataRpcApi.call<AdminSetMemberPasswordResult>("admin_set_member_initial_password", {
    p_member_id: memberId,
    p_new_password: newPassword,
  });
}

export async function adminGetMemberReferrals(memberId: string): Promise<{ success?: boolean; referrals?: unknown[] }> {
  return dataRpcApi.call("admin_get_member_referrals", { p_member_id: memberId });
}
