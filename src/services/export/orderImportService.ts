/**
 * 订单导入服务
 */

import { supabase } from '@/integrations/supabase/client';
import { createPointsOnOrderCreate, type CreatePointsParams } from '@/services/pointsService';
import { normalizeCurrencyCode } from '@/config/currencies';
import { calculateNormalOrderDerivedValues } from '@/lib/orderCalculations';
import { logOrderBalanceChange } from '@/services/balanceLogService';
import { cleanPhoneNumber } from './utils';

/**
 * 进度回调类型
 */
export interface ImportProgress {
  current: number;
  total: number;
  imported: number;
  skipped: number;
  pointsCreated: number;
  currentRow: string;
  stage: 'preparing' | 'importing' | 'completed';
}

export type ImportProgressCallback = (progress: ImportProgress) => void;

function generateOrderNumber(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const letterPart = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('');
  const numberPart = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return `${letterPart}${numberPart}`;
}

/**
 * 批量导入订单 - 通过完整业务逻辑（带进度回调）
 */
export async function batchImportOrders(
  records: Record<string, any>[],
  currentUserId: string | null,
  currentUserName?: string | null,
  onProgress?: ImportProgressCallback,
  skipPointsCreation: boolean = false
): Promise<{ imported: number; skipped: number; errors: string[]; pointsCreated: number }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[], pointsCreated: 0 };

  if (records.length === 0) return result;

  const reportProgress = (current: number, currentRow: string, stage: 'preparing' | 'importing' | 'completed' = 'importing') => {
    if (onProgress) {
      onProgress({
        current,
        total: records.length,
        imported: result.imported,
        skipped: result.skipped,
        pointsCreated: result.pointsCreated,
        currentRow,
        stage,
      });
    }
  };

  reportProgress(0, '正在准备数据映射...', 'preparing');

  const [cardsResult, vendorsResult, providersResult, employeesResult, membersResult] = await Promise.all([
    supabase.from('cards').select('id, name'),
    supabase.from('vendors').select('id, name'),
    supabase.from('payment_providers').select('id, name'),
    supabase.from('employees').select('id, real_name'),
    supabase.from('members').select('id, phone_number, member_code'),
  ]);

  const cardNameToId: Record<string, string> = {};
  cardsResult.data?.forEach(c => { cardNameToId[c.name.toLowerCase()] = c.id; });

  const vendorNameToId: Record<string, string> = {};
  const vendorIdToName: Record<string, string> = {};
  vendorsResult.data?.forEach(v => {
    vendorNameToId[v.name.toLowerCase()] = v.id;
    vendorIdToName[v.id] = v.name;
  });

  const providerNameToId: Record<string, string> = {};
  const providerIdToName: Record<string, string> = {};
  providersResult.data?.forEach(p => {
    providerNameToId[p.name.toLowerCase()] = p.id;
    providerIdToName[p.id] = p.name;
  });

  const employeeNameToId: Record<string, string> = {};
  employeesResult.data?.forEach(e => { employeeNameToId[e.real_name.toLowerCase()] = e.id; });

  const phoneToMember: Record<string, { id: string; member_code: string }> = {};
  membersResult.data?.forEach(m => {
    phoneToMember[m.phone_number] = { id: m.id, member_code: m.member_code };
  });

  const statusReverseMap: Record<string, string> = {
    '已完成': 'completed',
    '已取消': 'cancelled',
    '进行中': 'active',
  };

  reportProgress(0, '映射数据准备完成，开始导入...', 'preparing');

  for (let i = 0; i < records.length; i++) {
    const orderNumber = records[i].order_number || `第${i + 1}条`;
    reportProgress(i + 1, `正在处理: ${orderNumber}`, 'importing');

    try {
      const record = { ...records[i] };

      delete record.member_code;

      if (!record.order_number) {
        record.order_number = generateOrderNumber();
      }

      if (!record.status) {
        record.status = 'completed';
      } else if (statusReverseMap[record.status]) {
        record.status = statusReverseMap[record.status];
      }

      if (record.order_type && typeof record.order_type === 'string') {
        const cardId = cardNameToId[record.order_type.toLowerCase()];
        if (cardId) {
          record.order_type = cardId;
        }
      }

      if (record.card_merchant_id && typeof record.card_merchant_id === 'string') {
        const vendorId = vendorNameToId[record.card_merchant_id.toLowerCase()];
        if (vendorId) {
          record.card_merchant_id = vendorId;
        }
      }

      if (record.vendor_id && typeof record.vendor_id === 'string') {
        const providerId = providerNameToId[record.vendor_id.toLowerCase()];
        if (providerId) {
          record.vendor_id = providerId;
        }
      }

      if (record.creator_name && typeof record.creator_name === 'string') {
        const salesPersonId = employeeNameToId[record.creator_name.toLowerCase()];
        if (salesPersonId) {
          record.creator_id = salesPersonId;
          record.sales_user_id = salesPersonId;
        }
        delete record.creator_name;
      }

      if (!record.creator_id && currentUserId) {
        record.creator_id = currentUserId;
        record.sales_user_id = currentUserId;
      }

      let memberCode = '';
      let memberId = '';
      if (record.phone_number) {
        const cleanedPhone = cleanPhoneNumber(String(record.phone_number));
        record.phone_number = cleanedPhone;

        const memberInfo = phoneToMember[cleanedPhone];
        if (memberInfo) {
          record.member_id = memberInfo.id;
          memberId = memberInfo.id;
          memberCode = memberInfo.member_code;
        }
      }

      if (record.profit_rate && typeof record.profit_rate === 'string') {
        const rateStr = record.profit_rate.replace('%', '').trim();
        const rateNum = parseFloat(rateStr);
        if (!isNaN(rateNum)) {
          record.profit_rate = rateNum;
        }
      }

      if (!record.created_at) {
        record.created_at = new Date().toISOString();
      }

      const numericFields = ['card_value', 'exchange_rate', 'foreign_rate', 'actual_payment', 'fee'];
      for (const field of numericFields) {
        if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
          record[field] = parseFloat(String(record[field])) || 0;
        }
      }

      const cardValue = parseFloat(record.card_value) || 0;
      const cardRate = parseFloat(record.exchange_rate) || 1;
      const foreignRate = parseFloat(record.foreign_rate) || 1;
      const actualPayment = parseFloat(record.actual_payment) || 0;
      const fee = parseFloat(record.fee) || 0;
      const currency = (record.currency || 'NGN').toUpperCase();

      const cardWorth = cardValue * cardRate;
      record.amount = record.amount && record.amount !== 0
        ? parseFloat(String(record.amount))
        : cardWorth;

      record.data_version = 2;

      const derived = calculateNormalOrderDerivedValues({
        cardValue,
        cardRate,
        actualPaid: actualPayment,
        foreignRate,
        fee,
        currency,
      });

      record.payment_value = derived.paymentValue;

      if (currency === 'USDT') {
        record.profit_usdt = derived.profit;
      } else {
        record.profit_ngn = derived.profit;
      }

      record.profit_rate = derived.profitRate;

      record.points_status = 'none';
      record.order_points = 0;

      const { data: insertedOrder, error: insertError } = await supabase
        .from('orders')
        .insert(record as any)
        .select('id, phone_number, currency, actual_payment')
        .single();

      if (insertError) {
        result.errors.push(`行 ${i + 2}: ${insertError.message}`);
        result.skipped++;
        continue;
      }

      if (!skipPointsCreation && record.status === 'completed' && memberCode && record.phone_number && actualPayment > 0) {
        const normalizedCurrency = normalizeCurrencyCode(currency || 'NGN');

        if (normalizedCurrency) {
          try {
            const pointsParams: CreatePointsParams = {
              orderId: insertedOrder.id,
              orderPhoneNumber: record.phone_number,
              memberCode: memberCode,
              actualPayment: actualPayment,
              currency: normalizedCurrency,
              creatorId: record.creator_id || undefined,
            };

            const pointsResult = await createPointsOnOrderCreate(pointsParams);

            if (pointsResult.success) {
              await supabase
                .from('orders')
                .update({
                  points_status: 'added',
                  order_points: pointsResult.consumptionPoints
                })
                .eq('id', insertedOrder.id);

              result.pointsCreated++;
            }
          } catch (pointsError) {
            console.warn(`[ImportOrder] Failed to create points for order ${insertedOrder.id}:`, pointsError);
          }
        }
      }

      result.imported++;

      if (!skipPointsCreation && memberId && record.phone_number) {
        try {
          const normalizedCurrency = normalizeCurrencyCode(currency || 'NGN');
          if (normalizedCurrency) {
            const { batchUpdateMemberActivity } = await import('@/hooks/useMemberActivity');
            const profit = currency === 'USDT' ? record.profit_usdt : record.profit_ngn;
            await batchUpdateMemberActivity({
              memberId,
              phoneNumber: record.phone_number,
              accumulatedAmount: { currency: normalizedCurrency, amount: actualPayment },
              profitAmount: profit || 0,
              incrementOrderCount: true,
            });
          }
        } catch (activityError) {
          console.warn(`[ImportOrder] Failed to update member activity for order ${insertedOrder.id}:`, activityError);
        }
      }

      if (!skipPointsCreation && record.status === 'completed') {
        try {
          const vendorName = record.card_merchant_id ? (vendorIdToName[record.card_merchant_id] || '') : '';
          const providerName = record.vendor_id ? (providerIdToName[record.vendor_id] || '') : '';

          if (vendorName || providerName) {
            const profit = currency === 'USDT' ? record.profit_usdt : record.profit_ngn;
            await logOrderBalanceChange({
              vendorName,
              providerName,
              cardWorth: record.amount || cardWorth,
              paymentValue: record.payment_value || derived.paymentValue,
              actualPaid: actualPayment,
              currency: currency,
              foreignRate: foreignRate,
              orderId: insertedOrder.id,
              orderNumber: record.order_number,
              operatorId: record.creator_id || undefined,
              operatorName: currentUserName || undefined,
            });
          }
        } catch (balanceError) {
          console.warn(`[ImportOrder] Failed to log balance change for order ${insertedOrder.id}:`, balanceError);
        }
      }
    } catch (error: any) {
      result.errors.push(`行 ${i + 2}: ${error.message || '未知错误'}`);
      result.skipped++;
    }
  }

  reportProgress(records.length, '导入完成', 'completed');

  return result;
}
