/**
 * invitation_codes 表代理 — 列表 / 删除 / 启停
 */
import { apiGet, apiPatch, apiDelete } from './client';


export function listInvitationCodesData(query: string) {
  return apiGet<unknown[]>(`/api/data/table/invitation_codes${query ? `?${query}` : ''}`);
}

export function deleteInvitationCodeData(id: string) {
  return apiDelete(`/api/data/table/invitation_codes?id=eq.${encodeURIComponent(id)}`);
}

export function toggleInvitationCodeActiveData(id: string, isActive: boolean) {
  return apiPatch(`/api/data/table/invitation_codes?id=eq.${encodeURIComponent(id)}`, { data: { is_active: isActive } });
}
