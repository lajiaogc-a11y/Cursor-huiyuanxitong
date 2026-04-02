/**
 * invitation_codes 表代理：删除 / 切换状态
 */
import { apiDelete, apiPatch } from "@/api/client";

const BASE = "/api/data/table/invitation_codes";

export async function deleteInvitationCode(id: string): Promise<void> {
  await apiDelete(`${BASE}?id=eq.${encodeURIComponent(id)}`);
}

export async function toggleInvitationCodeActive(id: string, isActive: boolean): Promise<void> {
  await apiPatch(`${BASE}?id=eq.${encodeURIComponent(id)}`, {
    data: { is_active: isActive },
  });
}
