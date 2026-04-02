import { getSharedDataRepository } from '../data/repository.js';

/**
 * 审核中心「允许手动修改会员等级」开关，存于 shared_data_store auditSettings.allow_manual_member_level
 */
export async function getAllowManualMemberLevelFromStore(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  const raw = await getSharedDataRepository(tenantId, 'auditSettings');
  if (!raw || typeof raw !== 'object') return false;
  const v = (raw as Record<string, unknown>).allow_manual_member_level;
  return v === true;
}
