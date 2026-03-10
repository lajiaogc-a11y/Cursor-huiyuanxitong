// ============= Referral Store - 推荐关系管理 =============
// 使用数据库 referral_relations 表作为唯一数据源

import { supabase } from '@/integrations/supabase/client';
import { logOperation } from './auditLogStore';

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

// ============= 内存缓存 =============
let relationsCache: ReferralRelation[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializeReferralCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('referral_relations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    relationsCache = (data || []).map(r => ({
      id: r.id,
      referrerPhone: r.referrer_phone,
      referrerMemberCode: r.referrer_member_code,
      refereePhone: r.referee_phone,
      refereeMemberCode: r.referee_member_code,
      createdAt: r.created_at,
      source: r.source || '转介绍',
    }));
    
    cacheInitialized = true;
    console.log('[ReferralStore] Cache initialized from database');
  } catch (error) {
    console.error('[ReferralStore] Failed to initialize cache:', error);
  }
}

async function refreshCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('referral_relations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    relationsCache = (data || []).map(r => ({
      id: r.id,
      referrerPhone: r.referrer_phone,
      referrerMemberCode: r.referrer_member_code,
      refereePhone: r.referee_phone,
      refereeMemberCode: r.referee_member_code,
      createdAt: r.created_at,
      source: r.source || '转介绍',
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
    const { data: existingMember } = await supabase
      .from('members')
      .select('id')
      .eq('phone_number', refereePhone)
      .single();
    
    if (existingMember) {
      return {
        success: false,
        error_code: 'REFEREE_ALREADY_MEMBER',
        message: '该电话号码已是会员，无法被推荐',
      };
    }
    
    // 2. 校验介绍人是现有会员
    const { data: referrer, error: referrerError } = await supabase
      .from('members')
      .select('id, member_code, phone_number')
      .eq('phone_number', referrerPhone)
      .single();
    
    if (referrerError || !referrer) {
      return {
        success: false,
        error_code: 'REFERRER_NOT_FOUND',
        message: '介绍人不存在',
      };
    }
    
    // 3. 校验被推荐人不能有多个介绍人
    const { data: existingRelation } = await supabase
      .from('referral_relations')
      .select('id')
      .eq('referee_phone', refereePhone)
      .maybeSingle();
    
    if (existingRelation) {
      return {
        success: false,
        error_code: 'ALREADY_REFERRED',
        message: '该电话号码已被其他人推荐',
      };
    }
    
    // 4. 校验不能循环推荐（A推荐B后，B不能再推荐A）
    const { data: reverseRelation } = await supabase
      .from('referral_relations')
      .select('id')
      .eq('referrer_phone', refereePhone)
      .eq('referee_phone', referrerPhone)
      .maybeSingle();
    
    if (reverseRelation) {
      return {
        success: false,
        error_code: 'CIRCULAR_REFERRAL',
        message: '不允许循环推荐：该用户已经是您的介绍人',
      };
    }
    
    // 4. 创建被推荐人会员
    const newMemberCode = `M${Date.now().toString().slice(-8)}`;
    
    const { data: newMember, error: memberError } = await supabase
      .from('members')
      .insert({
        phone_number: refereePhone,
        member_code: newMemberCode,
        member_level: 'D',
        creator_id: creatorInfo?.id || null,
        // 不再存储 creator_name，姓名通过 creator_id 实时获取
      })
      .select()
      .single();
    
    if (memberError) throw memberError;
    
    // 5. 建立推荐关系
    const { data: newRelation, error: relationError } = await supabase
      .from('referral_relations')
      .insert({
        referrer_phone: referrerPhone,
        referrer_member_code: referrer.member_code,
        referee_phone: refereePhone,
        referee_member_code: newMemberCode,
        source: '转介绍',
      })
      .select()
      .single();
    
    if (relationError) throw relationError;
    
    await refreshCache();
    
    const relation: ReferralRelation = {
      id: newRelation.id,
      referrerPhone,
      referrerMemberCode: referrer.member_code,
      refereePhone,
      refereeMemberCode: newMemberCode,
      createdAt: newRelation.created_at,
      source: '转介绍',
    };
    
    logOperation(
      'referral',
      'create',
      relation.id,
      null,
      { relation, member: newMember },
      `介绍人 ${referrerPhone} 推荐新会员 ${refereePhone}`
    );
    
    return {
      success: true,
      message: '推荐关系提交成功',
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
      message: '系统错误，请稍后重试',
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
    
    const { error } = await supabase
      .from('referral_relations')
      .delete()
      .eq('referee_phone', refereePhone);
    
    if (error) throw error;
    
    await refreshCache();
    
    logOperation(
      'referral',
      'delete',
      relation.id,
      relation,
      null,
      `删除推荐关系：${refereePhone}`
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
