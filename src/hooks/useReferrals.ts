// ============= Referrals Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求
import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';

export interface ReferralRelation {
  id: string;
  referrerPhone: string;
  referrerMemberCode: string;
  refereePhone: string;
  refereeMemberCode: string;
  createdAt: string;
  source: string;
}

function mapDbRelationToRelation(dbRelation: any): ReferralRelation {
  return {
    id: dbRelation.id,
    referrerPhone: dbRelation.referrer_phone,
    referrerMemberCode: dbRelation.referrer_member_code,
    refereePhone: dbRelation.referee_phone,
    refereeMemberCode: dbRelation.referee_member_code,
    createdAt: dbRelation.created_at,
    source: dbRelation.source || '转介绍',
  };
}

// Standalone fetch function
export async function fetchReferralsFromDb(): Promise<ReferralRelation[]> {
  const { data, error } = await supabase
    .from('referral_relations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapDbRelationToRelation);
}

export function useReferrals() {
  const queryClient = useQueryClient();

  const { data: relations = [], isLoading: loading } = useQuery({
    queryKey: ['referrals'],
    queryFn: fetchReferralsFromDb,
  });

  // Realtime + userDataSynced -> invalidate cache
  useEffect(() => {
    const handleUserSynced = () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    };
    window.addEventListener('userDataSynced', handleUserSynced);

    const channel = supabase
      .channel('referrals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_relations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['referrals'] });
      })
      .subscribe();

    return () => {
      window.removeEventListener('userDataSynced', handleUserSynced);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const addReferral = async (
    referrerPhone: string,
    referrerMemberCode: string,
    refereePhone: string,
    refereeMemberCode: string
  ): Promise<ReferralRelation | null> => {
    try {
      const { data: existingRecord, error: checkError } = await supabase
        .from('referral_relations')
        .select('id')
        .eq('referee_phone', refereePhone)
        .maybeSingle();
      
      if (checkError) {
        console.error('Failed to check existing referral:', checkError);
      }
      
      if (existingRecord) {
        toast.error('该电话号码已被其他人推荐');
        return null;
      }

      const { data, error } = await supabase
        .from('referral_relations')
        .insert({
          referrer_phone: referrerPhone,
          referrer_member_code: referrerMemberCode,
          referee_phone: refereePhone,
          referee_member_code: refereeMemberCode,
          source: '转介绍',
        })
        .select()
        .single();

      if (error) throw error;

      const newRelation = mapDbRelationToRelation(data);

      logOperation(
        'referral',
        'create',
        newRelation.id,
        null,
        newRelation,
        `介绍人 ${referrerPhone} 推荐新会员 ${refereePhone}`
      );

      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      return newRelation;
    } catch (error) {
      console.error('Failed to add referral:', error);
      toast.error('创建推荐关系失败');
      return null;
    }
  };

  const getReferralCount = (referrerPhone: string): number => {
    return relations.filter(r => r.referrerPhone === referrerPhone).length;
  };

  const getReferralsByReferrer = (referrerPhone: string): ReferralRelation[] => {
    return relations.filter(r => r.referrerPhone === referrerPhone);
  };

  const getReferrerByReferee = (refereePhone: string): ReferralRelation | null => {
    return relations.find(r => r.refereePhone === refereePhone) || null;
  };

  const removeReferral = async (refereePhone: string): Promise<boolean> => {
    try {
      const relationToDelete = relations.find(r => r.refereePhone === refereePhone);
      
      const { error } = await supabase
        .from('referral_relations')
        .delete()
        .eq('referee_phone', refereePhone);

      if (error) throw error;
      
      if (relationToDelete) {
        logOperation(
          'referral',
          'delete',
          relationToDelete.id,
          relationToDelete,
          null,
          `删除推荐关系: 介绍人 ${relationToDelete.referrerPhone} -> 被推荐人 ${refereePhone}`
        );
      }
      
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      return true;
    } catch (error) {
      console.error('Failed to remove referral:', error);
      return false;
    }
  };

  return {
    relations,
    loading,
    addReferral,
    getReferralCount,
    getReferralsByReferrer,
    getReferrerByReferee,
    removeReferral,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  };
}
