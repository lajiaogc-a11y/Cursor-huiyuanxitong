// ============= Members Hook - react-query Migration =============
// Performance: cache-first reads, realtime invalidation, mutations unchanged
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notifyHub";
import {
  listMembersApi,
  listReferralsApi,
  createMemberApi,
  updateMemberApi,
  updateMemberByPhoneApi,
  deleteMemberApi,
} from '@/services/members/membersApiService';
import { logOperation } from '@/services/audit/auditLogService';
import { getEmployeeNameSync } from '@/services/employees/employeeHelpers';
import { mapDbMemberToMember as sharedMapDbMember, mapMemberToDb, type DbMemberRow } from '@/lib/mappers/memberMapper';
export type { DbMemberRow } from '@/lib/mappers/memberMapper';
export { mapMemberToDb } from '@/lib/mappers/memberMapper';
import { trackRender } from '@/lib/performanceUtils';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { useIsPlatformAdminViewingTenant } from '@/hooks/useIsPlatformAdminViewingTenant';
import { checkMyTenantQuotaResult, getQuotaExceededText, getQuotaSoftExceededText } from '@/services/tenantQuotaService';
import { useLanguage } from '@/contexts/LanguageContext';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { generateMemberCode } from '@/lib/memberCode';
import { ApiError } from '@/lib/apiClient';

export interface Member {
  id: string;
  phoneNumber: string;
  memberCode: string;
  /** 会员在前端门户设置的昵称；未设置时员工端展示可回退为会员编号 */
  nickname: string | null;
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
  initialPassword?: string;
  /** 累计邀请注册成功人次（只读，来自 members 表） */
  inviteSuccessLifetimeCount?: number;
  /** 累计获得奖励积分（只读） */
  lifetimeRewardPointsEarned?: number;
  /** 晋级用累计积分（只读） */
  totalPoints?: number;
  /** 当前等级规则 id（手动调级时用） */
  currentLevelId?: string | null;
}

type ReferralRelation = {
  referrer_phone: string;
  referrer_member_code: string;
  referee_phone: string;
};

function mapDbMemberToMember(dbMember: DbMemberRow, referralByPhone?: Record<string, ReferralRelation>): Member {
  const referral = referralByPhone?.[dbMember.phone_number];
  const recorderName = dbMember.creator_id
    ? getEmployeeNameSync(dbMember.creator_id)
    : '';
  return sharedMapDbMember(dbMember, { referral, recorderName });
}

// mapMemberToDb 已提取到 @/lib/mappers/memberMapper.ts（re-export 在文件顶部）

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
  const { t } = useLanguage();
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useMembers-mount');
  }, []);

  const { data: members = [], isLoading: loading, isFetching } = useQuery({
    queryKey: ['members', effectiveTenantId],
    queryFn: () => fetchMembersFromDb(effectiveTenantId, useMyTenantRpc),
    staleTime: STALE_TIME_LIST_MS,
    /** 会员列表：切回浏览器窗口时拉最新，弥补部分入口未走 notifyDataMutation 的遗漏 */
    refetchOnWindowFocus: true,
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

  // 仅订阅 members 表刷新（勿用 member-refresh：订单也会触发，会误拉全量会员）
  useEffect(() => {
    const invalidateMembers = () => {
      void queryClient.invalidateQueries({ queryKey: ['members'] });
    };
    window.addEventListener('data-refresh:members', invalidateMembers);
    return () => window.removeEventListener('data-refresh:members', invalidateMembers);
  }, [queryClient]);

  const addMember = async (memberData: Partial<Member> & { phoneNumber: string }): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法新增会员', 'Read-only in admin view, cannot add member'));
        return null;
      }
      if (!effectiveTenantId) {
        notify.error(t("请先进入业务租户后再新增会员（系统租户不可用于业务数据）", "Please enter a business tenant first (system tenant cannot be used for business data)"));
        return null;
      }
      const quotaResult = await checkMyTenantQuotaResult("members");
      if (!quotaResult.ok) {
        const quotaText = getQuotaExceededText(quotaResult.error.message);
        if (quotaText) {
          notify.error(quotaText.zh);
        } else {
          notify.error(t('当前操作已超出租户配额限制', 'Current operation exceeds tenant quota limit'));
        }
        return null;
      }
      const softQuotaText = getQuotaSoftExceededText(quotaResult.data?.message);
      if (softQuotaText) {
        notify.warning(softQuotaText.zh);
      }
      const existing = members.find(m => m.phoneNumber === memberData.phoneNumber);
      if (existing) {
        notify.error(t('该电话号码已存在', 'This phone number already exists'));
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
        currency_preferences: body.currency_preferences,
        remark: body.remark,
        customer_feature: body.customer_feature,
        source_id: body.source_id,
        creator_id: body.creator_id,
        recorder_id: body.recorder_id,
        common_cards: body.common_cards,
        bank_card: body.bank_card,
        tenant_id: effectiveTenantId,
      });

      if (!data) throw new Error(t('创建会员失败', 'Failed to create member'));

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
    } catch (error: unknown) {
      console.error('Failed to add member:', error);
      if (error instanceof ApiError) {
        if (error.statusCode === 409) {
          notify.error(t('该手机号或会员编号已存在', 'Phone or member code already exists'));
        } else {
          notify.error(error.message || t('创建会员失败', 'Failed to create member'));
        }
      } else {
        notify.error(t('创建会员失败', 'Failed to create member'));
      }
      return null;
    }
  };

  const updateMember = async (memberId: string, updates: Partial<Member>): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法修改会员', 'Read-only in admin view, cannot modify member'));
        return null;
      }
      const body: Record<string, unknown> = {};
      if (updates.currentLevelId !== undefined) body.current_level_id = updates.currentLevelId;
      else if (updates.level !== undefined) body.member_level = updates.level;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.customerFeature !== undefined) body.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) body.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) body.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) body.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) body.source_id = updates.sourceId || null;
      if (updates.memberCode !== undefined) {
        const c = String(updates.memberCode || '').trim();
        if (c) body.member_code = c;
      }
      if (updates.referrerPhone !== undefined) {
        const s = String(updates.referrerPhone ?? '').trim();
        body.referrer_phone = s === '' ? null : s;
      }

      if (Object.keys(body).length === 0) {
        notify.info(t('没有需要更新的内容', 'Nothing to update'));
        return members.find(m => m.id === memberId) || null;
      }
      
      const data = await updateMemberApi(memberId, body);

      if (!data) throw new Error(t('更新会员失败', 'Failed to update member'));
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
      if (error instanceof ApiError) {
        if (error.code === 'REFERRER_NOT_FOUND') {
          notify.error(t('未找到该推荐人，请确认为本租户会员', 'Referrer not found in this tenant'));
          return null;
        }
        if (error.code === 'REFERRER_SELF') {
          notify.error(t('不能将自己设为推荐人', 'Cannot set self as referrer'));
          return null;
        }
        if (error.code === 'REFERRER_TENANT_MISMATCH') {
          notify.error(t('推荐人不在当前租户', 'Referrer is not in current tenant'));
          return null;
        }
      }
      notify.error(t(`更新会员失败: ${error.message || '未知错误'}`, `Failed to update member: ${error.message || 'Unknown error'}`));
      return null;
    }
  };

  const updateMemberByPhone = async (phone: string, updates: Partial<Member>): Promise<Member | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        notify.error(t('平台总管理查看租户时为只读，无法修改会员', 'Read-only in admin view, cannot modify member'));
        return null;
      }
      const body: Record<string, unknown> = {};
      if (updates.currentLevelId !== undefined) body.current_level_id = updates.currentLevelId;
      else if (updates.level !== undefined) body.member_level = updates.level;
      if (updates.remark !== undefined) body.remark = updates.remark;
      if (updates.customerFeature !== undefined) body.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) body.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) body.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) body.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) body.source_id = updates.sourceId || null;
      if (updates.memberCode !== undefined) {
        const c = String(updates.memberCode || '').trim();
        if (c) body.member_code = c;
      }
      if (updates.referrerPhone !== undefined) {
        const s = String(updates.referrerPhone ?? '').trim();
        body.referrer_phone = s === '' ? null : s;
      }

      if (Object.keys(body).length === 0) {
        return members.find(m => m.phoneNumber === phone) || null;
      }
      
      const data = await updateMemberByPhoneApi(phone, body, effectiveTenantId);

      if (!data) return null;
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
      console.error('Failed to update member by phone:', error);
      if (error instanceof ApiError) {
        if (error.code === 'REFERRER_NOT_FOUND') {
          notify.error(t('未找到该推荐人，请确认为本租户会员', 'Referrer not found in this tenant'));
          return null;
        }
        if (error.code === 'REFERRER_SELF') {
          notify.error(t('不能将自己设为推荐人', 'Cannot set self as referrer'));
          return null;
        }
        if (error.code === 'REFERRER_TENANT_MISMATCH') {
          notify.error(t('推荐人不在当前租户', 'Referrer is not in current tenant'));
          return null;
        }
      }
      const msg = String(error?.message || error?.response?.data?.error?.message || '');
      if (msg.includes('MEMBER_CODE_TAKEN') || error?.response?.status === 409) {
        notify.error(t('会员编号已被占用', 'Member code already in use'));
      }
      return null;
    }
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
        notify.error(t('平台总管理查看租户时为只读，无法删除会员', 'Read-only in admin view, cannot delete member'));
        return false;
      }
      const memberToDelete = members.find(m => m.id === memberId);
      
      const ok = await deleteMemberApi(memberId, effectiveTenantId);
      if (!ok) throw new Error(t('删除会员失败', 'Failed to delete member'));

      if (memberToDelete) {
        logOperation('member_management', 'delete', memberId, memberToDelete, null, `删除会员: ${memberToDelete.phoneNumber}`);
      }
      notifyDataMutation({ table: 'members', operation: 'DELETE', source: 'mutation' }).catch(console.error);
      queryClient.invalidateQueries({ queryKey: ['members'] });
      return true;
    } catch (error) {
      console.error('Failed to delete member:', error);
      notify.error(t('删除会员失败', 'Failed to delete member'));
      return false;
    }
  };

  return {
    members,
    loading,
    isFetching,
    addMember,
    updateMember,
    updateMemberByPhone,
    deleteMember,
    findMemberByPhone,
    findMemberById,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
  };
}

