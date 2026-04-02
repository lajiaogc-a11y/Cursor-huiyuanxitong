// ============= Referrals Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { apiGet, apiPost, apiDelete } from '@/api/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { useLanguage } from '@/contexts/LanguageContext';

export interface ReferralRelation {
  id: string;
  referrerPhone: string;
  referrerMemberCode: string;
  refereePhone: string;
  refereeMemberCode: string;
  createdAt: string;
  source: string;
}

function unwrapSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
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
  const data = await apiGet<unknown>(
    `/api/data/table/referral_relations?select=*&order=created_at.desc`
  );
  return (Array.isArray(data) ? data : []).map(mapDbRelationToRelation);
}

export function useReferrals() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const { data: relations = [], isLoading: loading } = useQuery({
    queryKey: ['referrals'],
    queryFn: fetchReferralsFromDb,
    staleTime: STALE_TIME_LIST_MS,
  });

  useEffect(() => {
    const handleUserSynced = () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    };
    window.addEventListener('userDataSynced', handleUserSynced);
    return () => {
      window.removeEventListener('userDataSynced', handleUserSynced);
    };
  }, [queryClient]);

  const addReferral = async (
    referrerPhone: string,
    referrerMemberCode: string,
    refereePhone: string,
    refereeMemberCode: string,
    referrerId?: string,
    refereeId?: string,
  ): Promise<ReferralRelation | null> => {
    try {
      const existingRecord = await apiGet<{ id: string } | null>(
        `/api/data/table/referral_relations?select=id&referee_phone=eq.${encodeURIComponent(refereePhone)}&single=true`
      );

      if (existingRecord) {
        toast.error(t('该电话号码已被其他人推荐', 'This phone number has already been referred'));
        return null;
      }

      const insertData: Record<string, unknown> = {
        referrer_phone: referrerPhone,
        referrer_member_code: referrerMemberCode,
        referee_phone: refereePhone,
        referee_member_code: refereeMemberCode,
        source: '转介绍',
      };
      if (referrerId) insertData.referrer_id = referrerId;
      if (refereeId) insertData.referee_id = refereeId;

      const inserted = await apiPost<unknown>(`/api/data/table/referral_relations`, {
        data: insertData,
      });
      const row = unwrapSingle<Record<string, unknown>>(inserted);
      if (!row) throw new Error('Insert returned no row');

      const newRelation = mapDbRelationToRelation(row);

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
      toast.error(t('创建推荐关系失败', 'Failed to create referral'));
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
      
      await apiDelete(
        `/api/data/table/referral_relations?referee_phone=eq.${encodeURIComponent(refereePhone)}`
      );
      
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
