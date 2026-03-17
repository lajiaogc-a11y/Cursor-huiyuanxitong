// ============= Members Hook - react-query Migration =============
// Performance: cache-first reads, realtime invalidation, mutations unchanged
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  listMembersApi,
  listReferralsApi,
  createMemberApi,
  updateMemberApi,
  updateMemberByPhoneApi,
  deleteMemberApi,
} from '@/services/members/membersApiService';
import { logOperation } from '@/stores/auditLogStore';
import { getEmployeeNameSync } from '@/hooks/useEmployees';
import { trackRender } from '@/lib/performanceUtils';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { useIsPlatformAdminViewingTenant } from '@/hooks/useIsPlatformAdminViewingTenant';
import { checkMyTenantQuotaResult, getQuotaExceededText, getQuotaSoftExceededText } from '@/services/tenantQuotaService';

export interface Member {
  id: string;
  phoneNumber: string;
  memberCode: string;
  level: string;
  preferredCurrency: string[];
  remark: string;
  tradeFeature: string;
  sourceChannel: string;
  sourceId?: string;
  recorder: string;
  recorderId?: string;
  createdAt: string;
  commonCards: string[];
  customerFeature: string;
  bankCard?: string;
  currencyCode?: string;
  referrerPhone?: string;
  referrerMemberCode?: string;
}

type ReferralRelation = {
  referrer_phone: string;
  referrer_member_code: string;
  referee_phone: string;
};

function mapDbMemberToMember(dbMember: any, referralByPhone?: Record<string, ReferralRelation>): Member {
  const referral = referralByPhone?.[dbMember.phone_number];
  const recorderName = dbMember.creator_id 
    ? getEmployeeNameSync(dbMember.creator_id) 
    : '';
  
  return {
    id: dbMember.id,
    phoneNumber: dbMember.phone_number,
    memberCode: dbMember.member_code,
    level: dbMember.member_level || 'D',
    preferredCurrency: dbMember.currency_preferences || [],
    remark: dbMember.remark || '',
    tradeFeature: dbMember.customer_feature || '',
    sourceChannel: '',
    sourceId: dbMember.source_id || '',
    recorder: recorderName,
    recorderId: dbMember.creator_id || '',
    createdAt: dbMember.created_at,
    commonCards: dbMember.common_cards || [],
    customerFeature: dbMember.customer_feature || '',
    bankCard: dbMember.bank_card || '',
    currencyCode: '',
    referrerPhone: referral?.referrer_phone || '',
    referrerMemberCode: referral?.referrer_member_code || '',
  };
}

function mapMemberToDb(member: Partial<Member>): any {
  return {
    phone_number: member.phoneNumber,
    member_code: member.memberCode,
    member_level: member.level,
    currency_preferences: member.preferredCurrency || [],
    remark: member.remark,
    customer_feature: member.customerFeature || member.tradeFeature,
    source_id: member.sourceId || null,
    creator_id: member.recorderId || null,
    common_cards: member.commonCards || [],
    bank_card: member.bankCard,
  };
}

// Standalone query function for react-query - 通过 API 获取（供 prefetch 使用）
export async function fetchMembersFromDb(tenantId: string | null, _useMyTenantRpc?: boolean): Promise<Member[]> {
  // tenantId 为 null 时：平台管理员 → 不传 tenant_id，后端返回全部；租户员工不应出现此情况
  const [referrals, data] = await Promise.all([
    listReferralsApi(tenantId || undefined),
    listMembersApi(tenantId ? { tenant_id: tenantId, limit: 10000, page: 1 } : { limit: 10000, page: 1 }),
  ]);

  const referralByPhone = referrals.reduce<Record<string, ReferralRelation>>((acc, item) => {
    acc[item.referee_phone] = item;
    return acc;
  }, {});

  const members = (data || []).map((m: any) => mapDbMemberToMember(m, referralByPhone));
  return members;
}

export function useMembers() {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  // 平台总管理员未选租户时传 null → 后端返回全部会员；选租户时用 viewingTenantId；租户员工用其 tenant_id
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useMembers-mount');
  }, []);

  const { data: members = [], isLoading: loading } = useQuery({
    queryKey: ['members', effectiveTenantId],
    queryFn: () => fetchMembersFromDb(effectiveTenantId, useMyTenantRpc),
  });

  useEffect(() => {
    const handleUserSynced = () => {
      console.log('[useMembers] User data synced, invalidating cache');
      queryClient.invalidateQueries({ queryKey: ['members'] });
    };
    window.addEventListener('userDataSynced', handleUserSynced);

    return () => {
      window.removeEventListener('userDataSynced', handleUserSynced);
    };
  }, [queryClient]);

  const addMember = async (memberData: Partial<Member> & { phoneNumber: string }): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法新增会员');
        return null;
      }
      if (!effectiveTenantId) {
        toast.error("请先进入业务租户后再新增会员（系统租户不可用于业务数据）");
        return null;
      }
      const quotaResult = await checkMyTenantQuotaResult("members");
      if (!quotaResult.ok) {
        const quotaText = getQuotaExceededText(quotaResult.error.message);
        if (quotaText) {
          toast.error(quotaText.zh);
        } else {
          toast.error('当前操作已超出租户配额限制');
        }
        return null;
      }
      const softQuotaText = getQuotaSoftExceededText(quotaResult.data?.message);
      if (softQuotaText) {
        toast.warning(softQuotaText.zh);
      }
      const existing = members.find(m => m.phoneNumber === memberData.phoneNumber);
      if (existing) {
        toast.error('该电话号码已存在');
        return null;
      }

      const memberCode = memberData.memberCode || generateMemberCode();
      const body = {
        ...mapMemberToDb({ ...memberData, memberCode }),
        creator_id: memberData.recorderId || null,
        recorder_id: memberData.recorderId || null,
      };
      
      const data = await createMemberApi({
        phone_number: body.phone_number,
        member_code: body.member_code,
        member_level: body.member_level,
        currency_preferences: body.currency_preferences,
        remark: body.remark,
        customer_feature: body.customer_feature,
        source_id: body.source_id,
        creator_id: body.creator_id,
        recorder_id: body.recorder_id,
        common_cards: body.common_cards,
        bank_card: body.bank_card,
      });

      if (!data) throw new Error('创建会员失败');

      const newMember = mapDbMemberToMember(data);
      
      logOperation('member_management', 'create', newMember.id, null, newMember, `新增会员: ${newMember.phoneNumber}`);

      import('@/services/webhookService').then(({ triggerMemberCreated }) => {
        triggerMemberCreated({
          id: newMember.id, memberCode: newMember.memberCode, phoneNumber: newMember.phoneNumber,
          level: newMember.level, createdAt: data?.created_at ?? new Date().toISOString(),
        }).catch(err => console.error('[useMembers] Webhook trigger failed:', err));
      });

      notifyDataMutation({ table: 'members', operation: 'INSERT', source: 'mutation' }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ['members'] });

      return newMember;
    } catch (error) {
      console.error('Failed to add member:', error);
      toast.error('创建会员失败');
      return null;
    }
  };

  const updateMember = async (memberId: string, updates: Partial<Member>): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法修改会员');
        return null;
      }
      const body: Record<string, unknown> = {};
      if (updates.level !== undefined) body.member_level = updates.level;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.customerFeature !== undefined) body.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) body.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) body.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) body.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) body.source_id = updates.sourceId || null;
      
      if (Object.keys(body).length === 0) {
        toast.info('没有需要更新的内容');
        return members.find(m => m.id === memberId) || null;
      }
      
      const data = await updateMemberApi(memberId, body);

      if (!data) throw new Error('更新会员失败');
      const updatedMember = mapDbMemberToMember(data);
      
      import('@/services/webhookService').then(({ triggerMemberUpdated }) => {
        triggerMemberUpdated({
          id: updatedMember.id, memberCode: updatedMember.memberCode, phoneNumber: updatedMember.phoneNumber,
          level: updatedMember.level, updatedAt: data.updated_at ?? new Date().toISOString(),
        }).catch(err => console.error('[useMembers] Webhook trigger failed:', err));
      });

      notifyDataMutation({ table: 'members', operation: 'UPDATE', source: 'mutation' }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      
      return updatedMember;
    } catch (error: any) {
      console.error('Failed to update member:', error);
      toast.error(`更新会员失败: ${error.message || '未知错误'}`);
      return null;
    }
  };

  const updateMemberByPhone = async (phone: string, updates: Partial<Member>): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法修改会员');
        return null;
      }
      const body: Record<string, unknown> = {};
      if (updates.level !== undefined) body.member_level = updates.level;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.customerFeature !== undefined) body.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) body.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) body.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) body.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) body.source_id = updates.sourceId || null;
      
      if (Object.keys(body).length === 0) {
        return members.find(m => m.phoneNumber === phone) || null;
      }
      
      const data = await updateMemberByPhoneApi(phone, body);

      if (!data) return null;
      const updatedMember = mapDbMemberToMember(data);
      
      import('@/services/webhookService').then(({ triggerMemberUpdated }) => {
        triggerMemberUpdated({
          id: updatedMember.id, memberCode: updatedMember.memberCode, phoneNumber: updatedMember.phoneNumber,
          level: updatedMember.level, updatedAt: data.updated_at ?? new Date().toISOString(),
        }).catch(err => console.error('[useMembers] Webhook trigger failed:', err));
      });

      notifyDataMutation({ table: 'members', operation: 'UPDATE', source: 'mutation' }).catch(console.error);
      
      return updatedMember;
    } catch (error: any) {
      console.error('Failed to update member by phone:', error);
      return null;
    }
  };

  const updateMemberByPhoneAsync = (phone: string, updates: Partial<Member>): void => {
    setTimeout(() => {
      updateMemberByPhone(phone, updates).catch(err => {
        console.error('[useMembers] Async update failed:', err);
      });
    }, 0);
  };

  const findMemberByPhone = (phone: string): Member | undefined => {
    return members.find(m => m.phoneNumber === phone);
  };

  const findMemberById = (id: string): Member | undefined => {
    return members.find(m => m.id === id);
  };

  const deleteMember = async (memberId: string): Promise<boolean> => {
    try {
      if (isPlatformAdminReadonlyView) {
        toast.error('平台总管理查看租户时为只读，无法删除会员');
        return false;
      }
      const memberToDelete = members.find(m => m.id === memberId);
      
      const ok = await deleteMemberApi(memberId);
      if (!ok) throw new Error('删除会员失败');

      if (memberToDelete) {
        logOperation('member_management', 'delete', memberId, memberToDelete, null, `删除会员: ${memberToDelete.phoneNumber}`);
      }
      notifyDataMutation({ table: 'members', operation: 'DELETE', source: 'mutation' }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      return true;
    } catch (error) {
      console.error('Failed to delete member:', error);
      toast.error('删除会员失败');
      return false;
    }
  };

  return {
    members,
    loading,
    addMember,
    updateMember,
    updateMemberByPhone,
    updateMemberByPhoneAsync,
    deleteMember,
    findMemberByPhone,
    findMemberById,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  };
}

function generateMemberCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
