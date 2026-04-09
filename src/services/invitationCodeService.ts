/**
 * 员工邀请码：列表与 RPC 生成（表删除/启停见 invitationCodeTableService）
 */
import { listInvitationCodesData } from '@/api/invitationCodeData';
import { invitationCodesApi } from '@/api/invitationCodes';

export interface InvitationCodeRow {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export async function listInvitationCodes(): Promise<InvitationCodeRow[]> {
  const data = (await listInvitationCodesData("select=*&order=created_at.desc")) as InvitationCodeRow[];
  return Array.isArray(data) ? data : [];
}

export async function generateInvitationCodeRpc(maxUses: number, creatorId: string): Promise<string> {
  return invitationCodesApi.generate(maxUses, creatorId);
}
