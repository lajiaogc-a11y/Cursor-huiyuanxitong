// ============= Activity Gifts Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { getEmployeeNameById, getActivityTypeLabelByValue } from '@/services/nameResolver';
import { logGiftBalanceChange } from '@/services/balanceLogService';

function generateGiftNumber(): string {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const numPart = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
  return `GIFT-${datePart}-${numPart}`;
}

export async function generateUniqueGiftNumber(maxRetries = 3): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const giftNumber = generateGiftNumber();
    const { data, error } = await supabase
      .from('activity_gifts')
      .select('id')
      .eq('gift_number', giftNumber)
      .maybeSingle();
    if (error) {
      console.error('[generateUniqueGiftNumber] Check failed:', error);
      continue;
    }
    if (!data) return giftNumber;
    console.warn(`[generateUniqueGiftNumber] Collision detected for ${giftNumber}, retry ${i + 1}/${maxRetries}`);
  }
  return `${generateGiftNumber()}${Date.now().toString().slice(-4)}`;
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
export async function fetchActivityGiftsFromDb(): Promise<ActivityGift[]> {
  const { data, error } = await supabase
    .from('activity_gifts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapDbGiftToGift);
}

export function useActivityGifts() {
  const queryClient = useQueryClient();

  const { data: gifts = [], isLoading: loading } = useQuery({
    queryKey: ['activity-gifts'],
    queryFn: fetchActivityGiftsFromDb,
  });

  // Realtime subscriptions -> invalidate cache
  useEffect(() => {
    const giftsChannel = supabase
      .channel('activity-gifts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_gifts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-gifts'] });
      })
      .subscribe();
    
    const employeesChannel = supabase
      .channel('activity-gifts-employees-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-gifts'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(giftsChannel);
      supabase.removeChannel(employeesChannel);
    };
  }, [queryClient]);

  const addGift = async (giftData: Omit<ActivityGift, 'id' | 'createdAt'>, memberId?: string, employeeId?: string): Promise<ActivityGift | null> => {
    try {
      const giftNumber = await generateUniqueGiftNumber();
      const dbGift = {
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
      };

      const { data, error } = await supabase
        .from('activity_gifts')
        .insert(dbGift)
        .select()
        .single();

      if (error) throw error;

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
          createdAt: data.created_at,
        }).catch(err => console.error('[useActivityGifts] Webhook trigger failed:', err));
      });

      await queryClient.invalidateQueries({ queryKey: ['activity-gifts'] });
      
      window.dispatchEvent(new CustomEvent('activity-gifts-updated'));
      
      return newGift;
    } catch (error) {
      console.error('Failed to add activity gift:', error);
      toast.error('创建活动赠送失败');
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
    refetch: () => queryClient.invalidateQueries({ queryKey: ['activity-gifts'] }),
  };
}
