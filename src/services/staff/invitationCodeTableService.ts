/**
 * invitation_codes 表代理：删除 / 切换状态
 */
import { dataTableApi } from "@/api/data";

const TABLE = "invitation_codes";

export async function deleteInvitationCode(id: string): Promise<void> {
  await dataTableApi.del(TABLE, `id=eq.${encodeURIComponent(id)}`);
}

export async function toggleInvitationCodeActive(id: string, isActive: boolean): Promise<void> {
  await dataTableApi.patch(TABLE, `id=eq.${encodeURIComponent(id)}`, {
    data: { is_active: isActive },
  });
}
