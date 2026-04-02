// ============= Referral Store - 推荐关系管理 =============
// 使用数据库 referral_relations 表作为唯一数据源

import { apiGet, apiPost, apiDelete } from '@/api/client';
import { logOperation } from './auditLogStore';
import { pickBilingual } from '@/lib/appLocale';

function unwrapSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

// ============= Types =============

export interface ReferralRelation {
  id: string;
  referrerPhone: string;
  referrerMemberCode: string;
  refereePhone: string;
  refereeMemberCode: string;
  createdAt: string;
  source: string;
}

export interface ReferralSubmitResult {
  success: boolean;
  error_code?: string;
  message: string;
  data?: {
    relation: ReferralRelation;
    newMember: any;
  };
}

// ============= 进程内内存缓存（非持久化、非跨设备真源；由 DB/API 填充）=============
let relationsCache: ReferralRelation[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializeReferralCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const data = await apiGet<unknown>(
      `/api/data/table/referral_relations?select=*&order=created_at.desc&limit=5000`
    );
    const rows = Array.isArray(data) ? data : [];

    relationsCache = rows.map((r: Record<string, any>) => ({
      id: r.id,
      referrerPhone: r.referrer_phone,
      referrerMemberCode: r.referrer_member_code,
      refereePhone: r.referee_phone,
      refereeMemberCode: r.referee_member_code,
      createdAt: r.created_at,
      source: r.source || pickBilingual('转介绍', 'Referral'),
    }));
    
    cacheInitialized = true;
    console.log('[ReferralStore] Cache initialized from database');
  } catch (error) {
    console.error('[ReferralStore] Failed to initialize cache:', error);
  }
}

async function refreshCache(): Promise<void> {
  try {
    const data = await apiGet<unknown>(
      `/api/data/table/referral_relations?select=*&order=created_at.desc&limit=5000`
    );
    const rows = Array.isArray(data) ? data : [];

    relationsCache = rows.map((r: Record<string, any>) => ({
      id: r.id,
      referrerPhone: r.referrer_phone,
      referrerMemberCode: r.referrer_member_code,
      refereePhone: r.referee_phone,
      refereeMemberCode: r.referee_member_code,
      createdAt: r.created_at,
      source: r.source || pickBilingual('转介绍', 'Referral'),
    }));
  } catch (error) {
    console.error('[ReferralStore] Failed to refresh cache:', error);
  }
}

// ============= 读取函数 =============

export function getReferralRelations(): ReferralRelation[] {
  if (!cacheInitialized) {
    initializeReferralCache();
  }
  return relationsCache;
}

// ============= 核心提交函数 =============

export async function submitReferral(
  referrerPhone: string, 
  refereePhone: string,
  creatorInfo?: { id?: string; name?: string }
): Promise<ReferralSubmitResult> {
  try {
    // 1. 校验被推荐人不是现有会员
    const existingMember = await apiGet<{ id: string } | null>(
      `/api/data/table/members?select=id&phone_number=eq.${encodeURIComponent(refereePhone)}&single=true`
    );

    if (existingMember) {
      return {
        success: false,
        error_code: 'REFEREE_ALREADY_MEMBER',
        message: pickBilingual('该电话号码已是会员，无法被推荐', 'This phone number is already a member and cannot be referred'),
      };
    }
    
    // 2. 校验介绍人是现有会员
    const referrer = await apiGet<{ id: string; member_code: string; phone_number: string } | null>(
      `/api/data/table/members?select=id,member_code,phone_number&phone_number=eq.${encodeURIComponent(referrerPhone)}&single=true`
    );

    if (!referrer) {
      return {
        success: false,
        error_code: 'REFERRER_NOT_FOUND',
        message: pickBilingual('介绍人不存在', 'Referrer not found'),
      };
    }
    
    // 3. 校验被推荐人不能有多个介绍人
    const existingRelation = await apiGet<{ id: string } | null>(
      `/api/data/table/referral_relations?select=id&referee_phone=eq.${encodeURIComponent(refereePhone)}&single=true`
    );

    if (existingRelation) {
      return {
        success: false,
        error_code: 'ALREADY_REFERRED',
        message: pickBilingual('该电话号码已被其他人推荐', 'This phone number has already been referred by someone else'),
      };
    }
    
    // 4. 校验不能循环推荐（A推荐B后，B不能再推荐A）
    const reverseRelation = await apiGet<{ id: string } | null>(
      `/api/data/table/referral_relations?select=id&referrer_phone=eq.${encodeURIComponent(refereePhone)}&referee_phone=eq.${encodeURIComponent(referrerPhone)}&single=true`
    );

    if (reverseRelation) {
      return {
        success: false,
        error_code: 'CIRCULAR_REFERRAL',
        message: pickBilingual('不允许循环推荐：该用户已经是您的介绍人', 'Circular referral not allowed: this user is already your referrer'),
      };
    }
    
    // 4. 创建被推荐人会员（creator_id 必须有值，触发器依赖它设置 tenant_id）
    if (!creatorInfo?.id) {
      return {
        success: false,
        error_code: 'NO_CREATOR',
        message: pickBilingual('无法确定操作员身份，请重新登录后重试', 'Cannot determine operator identity, please re-login and try again'),
      };
    }
    const newMemberCode = `M${Date.now().toString().slice(-8)}`;
    
    const newMemberRaw = await apiPost<unknown>(`/api/data/table/members`, {
      data: {
        phone_number: refereePhone,
        member_code: newMemberCode,
        member_level: 'Starter',
        creator_id: creatorInfo.id,
      },
    });
    const newMember = unwrapSingle<Record<string, unknown>>(newMemberRaw);
    if (!newMember) throw new Error('Member insert returned no row');

    // 5. 建立推荐关系
    const insertData: Record<string, unknown> = {
      referrer_phone: referrerPhone,
      referrer_member_code: referrer.member_code,
      referee_phone: refereePhone,
      referee_member_code: newMemberCode,
      source: pickBilingual('转介绍', 'Referral'),
    };
    if (referrer.id) insertData.referrer_id = referrer.id;
    if (newMember.id) insertData.referee_id = newMember.id;
    const newRelationRaw = await apiPost<unknown>(`/api/data/table/referral_relations`, {
      data: insertData,
    });
    const newRelation = unwrapSingle<Record<string, unknown>>(newRelationRaw);
    if (!newRelation) throw new Error('Referral insert returned no row');
    
    await refreshCache();
    
    const relation: ReferralRelation = {
      id: newRelation.id,
      referrerPhone,
      referrerMemberCode: referrer.member_code,
      refereePhone,
      refereeMemberCode: newMemberCode,
      createdAt: String(newRelation.created_at ?? ''),
      source: pickBilingual('转介绍', 'Referral'),
    };
    
    logOperation(
      'referral',
      'create',
      relation.id,
      null,
      { relation, member: newMember },
      pickBilingual(`介绍人 ${referrerPhone} 推荐新会员 ${refereePhone}`, `Referrer ${referrerPhone} referred new member ${refereePhone}`)
    );

    void import('@/services/system/dataRefreshManager').then(({ notifyDataMutation, broadcastMembersListStale }) => {
      void notifyDataMutation({ table: 'members', operation: 'INSERT', source: 'mutation' });
      broadcastMembersListStale();
    });
    
    return {
      success: true,
      message: pickBilingual('推荐关系提交成功', 'Referral submitted successfully'),
      data: {
        relation,
        newMember,
      },
    };
  } catch (error) {
    console.error('[ReferralStore] Failed to submit referral:', error);
    return {
      success: false,
      error_code: 'SYSTEM_ERROR',
      message: pickBilingual('系统错误，请稍后重试', 'System error, please try again later'),
    };
  }
}

// ============= 查询函数 =============

export function getReferralCount(referrerPhone: string): number {
  const relations = getReferralRelations();
  return relations.filter(r => r.referrerPhone === referrerPhone).length;
}

export function getReferralsByReferrer(referrerPhone: string): ReferralRelation[] {
  const relations = getReferralRelations();
  return relations.filter(r => r.referrerPhone === referrerPhone);
}

export function getReferrerByReferee(refereePhone: string): ReferralRelation | null {
  const relations = getReferralRelations();
  return relations.find(r => r.refereePhone === refereePhone) || null;
}

export function getReferrerByMemberCode(memberCode: string): { phone: string; memberCode: string } | null {
  const relations = getReferralRelations();
  const relation = relations.find(r => r.refereeMemberCode === memberCode);
  
  if (!relation) return null;
  
  return {
    phone: relation.referrerPhone,
    memberCode: relation.referrerMemberCode,
  };
}

export async function removeReferralByReferee(refereePhone: string): Promise<boolean> {
  try {
    const relation = getReferrerByReferee(refereePhone);
    if (!relation) return false;
    
    await apiDelete(
      `/api/data/table/referral_relations?referee_phone=eq.${encodeURIComponent(refereePhone)}`
    );
    
    await refreshCache();
    
    logOperation(
      'referral',
      'delete',
      relation.id,
      relation,
      null,
      pickBilingual(`删除推荐关系：${refereePhone}`, `Delete referral: ${refereePhone}`)
    );
    
    return true;
  } catch (error) {
    console.error('[ReferralStore] Failed to remove referral:', error);
    return false;
  }
}

// ============= 兼容性函数 =============

export function migrateOldReferralData(): void {
  console.log('[ReferralStore] Data migration not needed - using database as source of truth');
}

// ============= Reset Function (账号切换时调用) =============

export function resetReferralCache(): void {
  relationsCache = [];
  cacheInitialized = false;
  console.log('[ReferralStore] Cache reset complete');
}
