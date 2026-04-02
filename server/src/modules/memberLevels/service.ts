import {
  listMemberLevelRulesRepository,
  replaceMemberLevelRulesRepository,
  recomputeAllMemberLevelsForTenantRepository,
} from './repository.js';
import type { MemberLevelRuleInput } from './types.js';

export async function listMemberLevelsService(tenantId: string) {
  return listMemberLevelRulesRepository(tenantId);
}

export async function saveMemberLevelsService(tenantId: string, rules: MemberLevelRuleInput[]) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw Object.assign(new Error('至少保留一条等级规则'), { code: 'LEVEL_RULES_EMPTY' });
  }
  const saved = await replaceMemberLevelRulesRepository(tenantId, rules);
  await recomputeAllMemberLevelsForTenantRepository(tenantId);
  return saved;
}
