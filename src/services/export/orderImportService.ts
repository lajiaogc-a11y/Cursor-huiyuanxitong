/**
 * 订单导入服务
 *
 * 副作用统一委托给 orderSideEffectOrchestrator.runImportOrderSideEffects，
 * 不在此文件内散落调用 points / activity / balance / webhook。
 */

import { listEmployeesApi } from '@/api/employees';
import { listMembersApi } from '@/services/members/membersApiService';
import { listCardsApi, listVendorsApi, listPaymentProvidersApi } from '@/services/shared/entityLookupService';
import { createOrderApi } from '@/services/orders/ordersApiService';
import { calculateNormalOrderDerivedValues, calculateUsdtOrderDerivedValues } from '@/lib/orderCalculations';
import { runImportOrderSideEffects } from '@/services/orders/orderSideEffectOrchestrator';
import { cleanPhoneNumber } from './utils';
import { getNowBeijingISO } from '@/lib/beijingTime';
import { generateUniqueOrderNumber } from '@/hooks/orders/utils';

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

/**
 * 批量导入订单 - 通过完整业务逻辑（带进度回调）
 */
export async function batchImportOrders(
  records: Record<string, any>[],
  currentUserId: string | null,
  currentUserName?: string | null,
  onProgress?: ImportProgressCallback,
  skipPointsCreation: boolean = false
): Promise<{ imported: number; skipped: number; errors: string[]; warnings: string[]; pointsCreated: number }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[], warnings: [] as string[], pointsCreated: 0 };

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

  const [cardsData, vendorsData, providersData, employeesList, membersData] = await Promise.all([
    listCardsApi(),
    listVendorsApi(),
    listPaymentProvidersApi(),
    listEmployeesApi(),
    listMembersApi({ limit: 10000 }),
  ]);

  const cardNameToId: Record<string, string> = {};
  (cardsData || []).forEach(c => { if (c.name) cardNameToId[String(c.name).toLowerCase()] = c.id; });

  const vendorNameToId: Record<string, string> = {};
  const vendorIdToName: Record<string, string> = {};
  (vendorsData || []).forEach(v => {
    if (v.name) vendorNameToId[String(v.name).toLowerCase()] = v.id;
    vendorIdToName[v.id] = v.name;
  });

  const providerNameToId: Record<string, string> = {};
  const providerIdToName: Record<string, string> = {};
  (providersData || []).forEach(p => {
    if (p.name) providerNameToId[String(p.name).toLowerCase()] = p.id;
    providerIdToName[p.id] = p.name;
  });

  const employeeNameToId: Record<string, string> = {};
  (employeesList || []).forEach((e) => {
    if (e.real_name) employeeNameToId[e.real_name.toLowerCase()] = e.id;
  });

  const phoneToMember: Record<string, { id: string; member_code: string }> = {};
  (membersData || []).forEach(m => {
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
        record.order_number = await generateUniqueOrderNumber();
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

      if (!record.account_id) {
        record.account_id = record.creator_id || currentUserId || null;
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
        record.created_at = getNowBeijingISO();
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

      if (currency === 'USDT') {
        const usdtDerived = calculateUsdtOrderDerivedValues({
          cardValue,
          cardRate,
          usdtRate: foreignRate,
          actualPaidUsdt: actualPayment,
          feeUsdt: fee,
        });
        record.payment_value = usdtDerived.paymentValue;
        record.profit_usdt = usdtDerived.profit;
        record.profit_rate = usdtDerived.profitRate;
      } else {
        const derived = calculateNormalOrderDerivedValues({
          cardValue,
          cardRate,
          actualPaid: actualPayment,
          foreignRate,
          fee,
          currency,
        });
        record.payment_value = derived.paymentValue;
        record.profit_ngn = derived.profit;
        record.profit_rate = derived.profitRate;
      }

      record.points_status = 'none';
      record.order_points = 0;

      const insertedOrder = await createOrderApi(record as Record<string, unknown>);

      if (!insertedOrder) {
        result.errors.push(`行 ${i + 2}: 创建订单失败`);
        result.skipped++;
        continue;
      }

      result.imported++;

      // --- Unified side-effects via orchestrator ---
      // Server createOrderService already handled: member activity increment,
      // common cards sync, and spin credits. We only run client-side side-effects
      // that the server doesn't cover: points, balance log, webhook.
      if (!skipPointsCreation && record.status === 'completed') {
        const vendorName = record.card_merchant_id ? (vendorIdToName[record.card_merchant_id] || '') : '';
        const providerName = record.vendor_id ? (providerIdToName[record.vendor_id] || '') : '';

        const sideEffects = await runImportOrderSideEffects({
          orderId: insertedOrder.id,
          orderNumber: record.order_number,
          phoneNumber: record.phone_number || '',
          memberCode: memberCode,
          currency: currency,
          cardValue: cardValue,
          cardWorth: record.amount || cardWorth,
          paymentValue: record.payment_value || 0,
          actualPaid: actualPayment,
          foreignRate: foreignRate,
          vendorId: record.card_merchant_id || '',
          providerId: record.vendor_id || '',
          vendorName,
          providerName,
          cardType: record.order_type || '',
          creatorId: record.creator_id || undefined,
          creatorName: currentUserName || undefined,
          createdAt: record.created_at,
          pointsStatus: record.points_status || 'none',
          skipPoints: skipPointsCreation || !memberCode || !record.phone_number || actualPayment <= 0,
        });

        if (sideEffects.pointsCreated) result.pointsCreated++;
        for (const w of sideEffects.warnings) {
          result.warnings.push(`行 ${i + 2}: ${w}`);
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
