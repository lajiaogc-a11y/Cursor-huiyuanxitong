/**
 * Invitation Codes API Client — 邀请码 RPC 请求层
 */
import { apiPost } from './client';

export const invitationCodesApi = {
  generate: (maxUses: number, creatorId: string) =>
    apiPost<string>('/api/data/rpc/generate_invitation_code', {
      p_max_uses: maxUses,
      p_creator_id: creatorId,
    }),
};
