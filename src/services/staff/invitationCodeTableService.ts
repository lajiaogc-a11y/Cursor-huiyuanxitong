/**
 * invitation_codes 表代理：删除 / 切换状态
 */
import { deleteInvitationCodeData, toggleInvitationCodeActiveData } from "@/api/invitationCodeData";

export async function deleteInvitationCode(id: string): Promise<void> {
  await deleteInvitationCodeData(id);
}

export async function toggleInvitationCodeActive(id: string, isActive: boolean): Promise<void> {
  await toggleInvitationCodeActiveData(id, isActive);
}
