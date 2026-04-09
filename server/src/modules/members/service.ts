/**
 * Members Service - 会员业务逻辑
 */
import {
  listMembersRepository,
  getMemberByIdRepository,
  createMemberRepository,
  updateMemberRepository,
  updateMemberByPhoneRepository,
  deleteMemberRepository,
  listReferralsRepository,
  getCustomerDetailByPhoneRepository,
  getReferrerByRefereePhoneRepository,
  bulkCreateMembersRepository,
  lookupMemberForReferralRepository,
} from './repository.js';
import { syncMemberCommonCardsFromOrdersRepository } from './memberCommonCardsFromOrders.js';
import type { ListMembersQuery, CreateMemberBody, UpdateMemberBody, BulkCreateMemberItem } from './types.js';
import { getAllowManualMemberLevelFromStore } from '../memberLevels/auditFlag.js';
import { getMemberLevelRuleByIdRepository } from '../memberLevels/repository.js';

export async function listMembersService(tenantId: string | undefined, query: ListMembersQuery) {
  return listMembersRepository(tenantId, query);
}

async function attachLevelPayload(row: Record<string, unknown>) {
  const tid = row.tenant_id != null ? String(row.tenant_id) : '';
  const lid = row.current_level_id != null ? String(row.current_level_id) : '';
  let level: Record<string, unknown> | null = null;
  if (tid && lid) {
    const rule = await getMemberLevelRuleByIdRepository(lid, tid);
    if (rule) {
      level = {
        id: rule.id,
        name: rule.level_name,
        required_points: rule.required_points,
        level_order: rule.level_order,
        rate_bonus: rule.rate_bonus,
        priority_level: rule.priority_level,
      };
    }
  }
  if (!level && row.member_level) {
    level = { name: String(row.member_level) };
  }
  return {
    ...row,
    total_points: Math.max(0, Number(row.total_points) || 0),
    level,
  };
}

export async function getMemberByIdService(id: string, tenantId: string | undefined) {
  const row = await getMemberByIdRepository(id, tenantId);
  return attachLevelPayload(row as Record<string, unknown>);
}

export async function createMemberService(tenantId: string, body: CreateMemberBody) {
  const { member_level: _m, ...rest } = body;
  return createMemberRepository(tenantId, rest);
}

function stripLevelIfLocked(body: UpdateMemberBody, allow: boolean): UpdateMemberBody {
  if (allow) return body;
  const { member_level: _ml, current_level_id: _cl, ...rest } = body;
  return rest;
}

export async function updateMemberService(id: string, tenantId: string, body: UpdateMemberBody) {
  const allow = await getAllowManualMemberLevelFromStore(tenantId);
  return updateMemberRepository(id, tenantId, stripLevelIfLocked(body, allow));
}

export async function updateMemberByPhoneService(phone: string, tenantId: string, body: UpdateMemberBody) {
  const allow = await getAllowManualMemberLevelFromStore(tenantId);
  return updateMemberByPhoneRepository(phone, tenantId, stripLevelIfLocked(body, allow));
}

export async function deleteMemberService(id: string, tenantId: string) {
  return deleteMemberRepository(id, tenantId);
}

export async function listReferralsService(tenantId?: string) {
  return listReferralsRepository(tenantId);
}

export async function getCustomerDetailByPhoneService(
  phone: string,
  tenantId?: string,
  opts?: { syncCommonCardsFromOrders?: boolean }
) {
  let detail = await getCustomerDetailByPhoneRepository(phone, tenantId);
  if (opts?.syncCommonCardsFromOrders && detail.member?.id) {
    const m = detail.member;
    const tid = String(m.tenant_id || tenantId || '').trim();
    if (tid) {
      try {
        await syncMemberCommonCardsFromOrdersRepository(m.id, tid, m.phone_number);
        detail = await getCustomerDetailByPhoneRepository(phone, tenantId);
      } catch (e) {
        console.warn('[customerDetail] syncCommonCardsFromOrders:', (e as Error).message);
      }
    }
  }
  return detail;
}

export async function getReferrerByRefereePhoneService(refereePhone: string, tenantId?: string) {
  return getReferrerByRefereePhoneRepository(refereePhone, tenantId);
}

export async function lookupMemberForReferralService(tenantId: string, q: string) {
  return lookupMemberForReferralRepository(tenantId, q);
}

export async function bulkCreateMembersService(tenantId: string, items: BulkCreateMemberItem[]) {
  const stripped = items.map(({ member_level: _x, ...item }) => item);
  return bulkCreateMembersRepository(tenantId, stripped);
}

// ── 权限辅助（Controller 统一走 Service 层） ──────────────────────────────

import { getMemberTenantIdById, updateMemberPasswordHashByMemberId } from './repository.js';

/** 获取会员所属租户 ID（用于跨模块权限校验） */
export async function getMemberTenantIdService(memberId: string): Promise<string | null> {
  return getMemberTenantIdById(memberId);
}

/** 更新会员密码哈希，返回受影响行数 */
export async function updateMemberPasswordHashService(
  memberId: string,
  tenantId: string | null,
  hash: string,
): Promise<number> {
  return updateMemberPasswordHashByMemberId(memberId, hash, tenantId);
}
