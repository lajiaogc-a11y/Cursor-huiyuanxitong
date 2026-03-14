// ============= Members Hook - react-query Migration =============
// Performance: cache-first reads, realtime invalidation, mutations unchanged
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { getEmployeeNameSync } from '@/hooks/useEmployees';
import { isUserTyping, trackRender } from '@/lib/performanceUtils';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { notifyDataMutation } from '@/services/dataRefreshManager';
import { useIsPlatformAdminViewingTenant } from '@/hooks/useIsPlatformAdminViewingTenant';

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

// 推荐关系缓存
let referralRelationsCache: { referrer_phone: string; referrer_member_code: string; referee_phone: string }[] = [];

function mapDbMemberToMember(dbMember: any): Member {
  const referral = referralRelationsCache.find(r => r.referee_phone === dbMember.phone_number);
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

// Standalone query function for react-query - 一律使用 RPC，避免 RLS 拦截（供 prefetch 使用）
export async function fetchMembersFromDb(tenantId: string | null, useMyTenantRpc?: boolean): Promise<Member[]> {
  const { getTenantMembersFull, getMyTenantMembersFull } = await import('@/services/tenantService');
  const data = (tenantId && !useMyTenantRpc)
    ? await getTenantMembersFull(tenantId)
    : await getMyTenantMembersFull();
  const members = (data || []).map((m: any) => mapDbMemberToMember(m));

  // Fetch referral relations (referral_relations 通常无租户隔离)
  const { data: referrals } = await supabase
    .from('referral_relations')
    .select('referrer_phone, referrer_member_code, referee_phone');
  referralRelationsCache = referrals || [];

  return members;
}

export function useMembers() {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);

  useEffect(() => {
    trackRender('useMembers-mount');
  }, []);

  const { data: members = [], isLoading: loading } = useQuery({
    queryKey: ['members', effectiveTenantId],
    queryFn: () => fetchMembersFromDb(effectiveTenantId, useMyTenantRpc),
  });

  // Smart refresh helpers for realtime
  const pendingRefreshRef = useRef(false);
  const refreshCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const smartInvalidate = useCallback(() => {
    if (isUserTyping()) {
      pendingRefreshRef.current = true;
      if (!refreshCheckIntervalRef.current) {
        refreshCheckIntervalRef.current = setInterval(() => {
          if (!isUserTyping() && pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            queryClient.invalidateQueries({ queryKey: ['members'] });
            if (refreshCheckIntervalRef.current) {
              clearInterval(refreshCheckIntervalRef.current);
              refreshCheckIntervalRef.current = null;
            }
          }
        }, 500);
      }
    } else {
      queryClient.invalidateQueries({ queryKey: ['members'] });
    }
  }, [queryClient]);

  useEffect(() => {
    const handleUserSynced = () => {
      console.log('[useMembers] User data synced, invalidating cache');
      queryClient.invalidateQueries({ queryKey: ['members'] });
    };
    window.addEventListener('userDataSynced', handleUserSynced);

    const membersChannel = supabase
      .channel('members-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        smartInvalidate();
      })
      .subscribe();
    
    const employeesChannel = supabase
      .channel('members-employees-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, () => {
        smartInvalidate();
      })
      .subscribe();

    return () => {
      window.removeEventListener('userDataSynced', handleUserSynced);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(employeesChannel);
      if (refreshCheckIntervalRef.current) {
        clearInterval(refreshCheckIntervalRef.current);
      }
    };
  }, [queryClient, smartInvalidate]);

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
      const existing = members.find(m => m.phoneNumber === memberData.phoneNumber);
      if (existing) {
        toast.error('该电话号码已存在');
        return null;
      }

      const memberCode = memberData.memberCode || generateMemberCode();
      const dbData = {
        ...mapMemberToDb({ ...memberData, memberCode }),
        creator_id: memberData.recorderId || null,
        tenant_id: effectiveTenantId || null,
      };
      
      const { data, error } = await supabase
        .from('members')
        .insert(dbData)
        .select()
        .single();

      if (error) throw error;

      const newMember = mapDbMemberToMember(data);
      
      logOperation('member_management', 'create', newMember.id, null, newMember, `新增会员: ${newMember.phoneNumber}`);

      import('@/services/webhookService').then(({ triggerMemberCreated }) => {
        triggerMemberCreated({
          id: newMember.id, memberCode: newMember.memberCode, phoneNumber: newMember.phoneNumber,
          level: newMember.level, createdAt: data.created_at,
        }).catch(err => console.error('[useMembers] Webhook trigger failed:', err));
      });

      notifyDataMutation({ table: 'members', operation: 'INSERT', source: 'mutation' }).catch(console.error);

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
      const dbUpdates: any = {};
      if (updates.level !== undefined) dbUpdates.member_level = updates.level;
      if (updates.remark !== undefined) dbUpdates.remark = updates.remark;
      if (updates.customerFeature !== undefined) dbUpdates.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) dbUpdates.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) dbUpdates.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) dbUpdates.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) dbUpdates.source_id = updates.sourceId || null;
      
      if (Object.keys(dbUpdates).length === 0) {
        toast.info('没有需要更新的内容');
        return members.find(m => m.id === memberId) || null;
      }
      
      const { data, error } = await supabase
        .from('members')
        .update(dbUpdates)
        .eq('id', memberId)
        .select()
        .single();

      if (error) throw error;
      const updatedMember = mapDbMemberToMember(data);
      
      import('@/services/webhookService').then(({ triggerMemberUpdated }) => {
        triggerMemberUpdated({
          id: updatedMember.id, memberCode: updatedMember.memberCode, phoneNumber: updatedMember.phoneNumber,
          level: updatedMember.level, updatedAt: data.updated_at,
        }).catch(err => console.error('[useMembers] Webhook trigger failed:', err));
      });

      notifyDataMutation({ table: 'members', operation: 'UPDATE', source: 'mutation' }).catch(console.error);
      
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
      const dbUpdates: any = {};
      if (updates.level !== undefined) dbUpdates.member_level = updates.level;
      if (updates.remark !== undefined) dbUpdates.remark = updates.remark;
      if (updates.customerFeature !== undefined) dbUpdates.customer_feature = updates.customerFeature;
      if (updates.commonCards !== undefined) dbUpdates.common_cards = updates.commonCards;
      if (updates.bankCard !== undefined) dbUpdates.bank_card = updates.bankCard;
      if (updates.preferredCurrency !== undefined) dbUpdates.currency_preferences = updates.preferredCurrency;
      if (updates.sourceId !== undefined) dbUpdates.source_id = updates.sourceId || null;
      
      if (Object.keys(dbUpdates).length === 0) {
        return members.find(m => m.phoneNumber === phone) || null;
      }
      
      const { data, error } = await supabase
        .from('members')
        .update(dbUpdates)
        .eq('phone_number', phone)
        .select()
        .single();

      if (error) throw error;
      const updatedMember = mapDbMemberToMember(data);
      
      import('@/services/webhookService').then(({ triggerMemberUpdated }) => {
        triggerMemberUpdated({
          id: updatedMember.id, memberCode: updatedMember.memberCode, phoneNumber: updatedMember.phoneNumber,
          level: updatedMember.level, updatedAt: data.updated_at,
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
      
      await supabase.from('orders').update({ member_id: null }).eq('member_id', memberId);
      await supabase.from('points_ledger').update({ member_id: null }).eq('member_id', memberId);
      await supabase.from('activity_gifts').update({ member_id: null }).eq('member_id', memberId);
      await supabase.from('member_activity').delete().eq('member_id', memberId);
      
      const { error } = await supabase.from('members').delete().eq('id', memberId);
      if (error) throw error;

      if (memberToDelete) {
        logOperation('member_management', 'delete', memberId, memberToDelete, null, `删除会员: ${memberToDelete.phoneNumber}`);
      }
      notifyDataMutation({ table: 'members', operation: 'DELETE', source: 'mutation' }).catch(console.error);
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
