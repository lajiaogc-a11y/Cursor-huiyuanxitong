/**
 * 员工邀请码：列表与 RPC 生成（表删除/启停见 invitationCodeTableService）
 */
import { apiGet, apiPost } from '@/api/client';

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
  const data = await apiGet<InvitationCodeRow[]>(
    '/api/data/table/invitation_codes?select=*&order=created_at.desc',
  );
  return Array.isArray(data) ? data : [];
}

export async function generateInvitationCodeRpc(maxUses: number, creatorId: string): Promise<string> {
  return apiPost<string>('/api/data/rpc/generate_invitation_code', {
    p_max_uses: maxUses,
    p_creator_id: creatorId,
  });
}
