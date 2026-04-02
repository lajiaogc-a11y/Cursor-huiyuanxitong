// ============= Activity Gifts Hook - react-query Migration =============
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { getEmployeeNameById, getActivityTypeLabelByValue } from '@/services/members/nameResolver';
import { logGiftBalanceChange } from '@/services/finance/balanceLogService';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { useIsPlatformAdminViewingTenant } from '@/hooks/useIsPlatformAdminViewingTenant';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildShortGiftNumberCandidate, randomGiftSuffix } from '@/lib/giftNumber';
import { getActivityDataApi } from '@/services/staff/dataApi';

export async function generateUniqueGiftNumber(maxRetries = 8): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const giftNumber = buildShortGiftNumberCandidate();
    try {
      const row = await apiGet<{ id?: string } | null>(
        `/api/data/table/activity_gifts?select=id&gift_number=eq.${encodeURIComponent(giftNumber)}&single=true`
      );
      if (!row?.id) return giftNumber;
    } catch (e) {
      console.error('[generateUniqueGiftNumber] Check failed:', e);
      continue;
    }
    console.warn(`[generateUniqueGiftNumber] Collision detected for ${giftNumber}, retry ${i + 1}/${maxRetries}`);
  }
  return `${buildShortGiftNumberCandidate()}${randomGiftSuffix(2)}`;
}

export interface ActivityGift {
  id: string;
  giftNumber?: string;
  currency: string;
  amount: number;
  rate: number;
  phoneNumber: string;
  paymentAgent: string;
  giftType: string;
  giftTypeLabel?: string;
  fee: number;
  giftValue: number;
  remark: string;
  createdAt: string;
  creatorName?: string;
  creatorId?: string;
}

function mapDbGiftToGift(dbGift: any): ActivityGift {
  const creatorName = dbGift.creator_id 
    ? getEmployeeNameById(dbGift.creator_id) 
    : (dbGift.creator_name || '');
  
  const giftType = dbGift.gift_type || '';
  let giftTypeLabel = giftType;
  if (giftType === 'activity_1') {
    giftTypeLabel = '活动1兑换';
  } else if (giftType === 'activity_2') {
    giftTypeLabel = '活动2兑换';
  } else if (giftType) {
    giftTypeLabel = getActivityTypeLabelByValue(giftType);
  }
  
  return {
    id: dbGift.id,
    giftNumber: dbGift.gift_number,
    currency: dbGift.currency,
    amount: Number(dbGift.amount),
    rate: Number(dbGift.rate),
    phoneNumber: dbGift.phone_number,
    paymentAgent: dbGift.payment_agent,
    giftType,
    giftTypeLabel,
    fee: Number(dbGift.fee) || 0,
    giftValue: Number(dbGift.gift_value) || 0,
    remark: dbGift.remark || '',
    createdAt: dbGift.created_at,
    creatorName,
    creatorId: dbGift.creator_id || '',
  };
}

// Standalone fetch function
export async function fetchActivityGiftsFromDb(tenantId?: string | null): Promise<ActivityGift[]> {
  const activityData = await getActivityDataApi(tenantId);
  return (activityData.gifts || []).map(mapDbGiftToGift);
}

export function useActivityGifts() {
  const queryClient = useQueryClient();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;

  const { data: gifts = [], isLoading: loading } = useQuery({
    queryKey: ['activity-gifts', effectiveTenantId ?? ''],
    queryFn: () => fetchActivityGiftsFromDb(effectiveTenantId),
    staleTime: STALE_TIME_LIST_MS,
  });

  const addGift = async (giftData: Omit<ActivityGift, 'id' | 'createdAt'>, memberId?: string, employeeId?: string): Promise<ActivityGift | null> => {
    try {
      if (isPlatformAdminReadonlyView) {
        toast.error(t('平台总管理查看租户时为只读，无法新增活动赠送', 'Read-only in admin view, cannot add activity gift'));
        return null;
      }
      const giftNumber = await generateUniqueGiftNumber();
      const dbGift: Record<string, unknown> = {
        gift_number: giftNumber,
        currency: giftData.currency,
        amount: giftData.amount,
        rate: giftData.rate,
        phone_number: giftData.phoneNumber,
        payment_agent: giftData.paymentAgent,
        gift_type: giftData.giftType,
        fee: giftData.fee,
        gift_value: giftData.giftValue,
        remark: giftData.remark,
        creator_id: employeeId || null,
        member_id: memberId || null,
        tenant_id: effectiveTenantId ?? employee?.tenant_id ?? null,
      };

      const data = await apiPost<Record<string, unknown>>('/api/data/table/activity_gifts', { data: dbGift });

      const newGift = mapDbGiftToGift(data);

      logOperation(
        'activity_gift',
        'create',
        newGift.id,
        null,
        newGift,
        `新增活动赠送: ${newGift.currency} ${newGift.amount}`
      );

      // Fire-and-forget balance log
      logGiftBalanceChange({
        providerName: newGift.paymentAgent,
        giftValue: newGift.giftValue,
        giftId: newGift.id,
        phoneNumber: newGift.phoneNumber,
        operatorId: employeeId,
        operatorName: employeeId ? getEmployeeNameById(employeeId) : undefined,
      }).catch(err => console.error('[useActivityGifts] Balance log failed:', err));

      // Fire-and-forget webhook
      import('@/services/webhookService').then(({ triggerGiftCreated }) => {
        triggerGiftCreated({
          id: newGift.id,
          memberId: memberId,
          phoneNumber: newGift.phoneNumber,
          currency: newGift.currency,
          amount: newGift.amount,
          giftValue: newGift.giftValue,
          giftType: newGift.giftType,
          createdAt: String((data as { created_at?: string }).created_at ?? ''),
        }).catch(err => console.error('[useActivityGifts] Webhook trigger failed:', err));
      });

      await queryClient.invalidateQueries({ queryKey: ['activity-gifts', effectiveTenantId ?? ''] });
      
      notifyDataMutation({ table: 'activity_gifts', operation: 'INSERT', source: 'mutation' }).catch(console.error);
      
      return newGift;
    } catch (error) {
      console.error('Failed to add activity gift:', error);
      toast.error(t('创建活动赠送失败', 'Failed to create activity gift'));
      return null;
    }
  };

  const getGiftsByPhone = (phoneNumber: string): ActivityGift[] => {
    return gifts.filter(g => g.phoneNumber === phoneNumber);
  };

  return {
    gifts,
    loading,
    addGift,
    getGiftsByPhone,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['activity-gifts', effectiveTenantId ?? ''] }),
  };
}
