/**
 * Balance Log Service - 统一管理订单和赠送相关的余额变动日志
 * 
 * 🔧 已完成迁移：仅写入 ledger_transactions，旧 balance_change_logs 已废弃
 */

import { apiGet, apiPatch } from '@/api/client';
import { createLedgerEntry, createAdjustmentEntry, reverseAllEntriesForSource, AccountType, SourceType } from '@/services/finance/ledgerTransactionService';
import { 
  getCardMerchantSettlementsAsync, 
  getPaymentProviderSettlementsAsync, 
  addPostResetAdjustment, 
  MerchantType 
} from '@/services/finance/merchantSettlementService';

/**
 * 辅助函数：判断记录是否在重置时间之前，如果是则写入 postResetAdjustment
 */
export async function applyPostResetAdjustmentIfNeeded(
  merchantType: MerchantType,
  merchantName: string,
  recordCreatedAt: string,
  delta: number
): Promise<void> {
  if (!merchantName || Math.abs(delta) < 0.01) return;
  
  try {
    let lastResetTime: string | null = null;
    
    if (merchantType === 'card_vendor') {
      const settlements = await getCardMerchantSettlementsAsync();
      const settlement = settlements.find(s => s.vendorName === merchantName);
      lastResetTime = settlement?.lastResetTime || null;
    } else {
      const settlements = await getPaymentProviderSettlementsAsync();
      const settlement = settlements.find(s => s.providerName === merchantName);
      lastResetTime = settlement?.lastResetTime || null;
    }
    
    if (!lastResetTime) return; // 无重置时间，不需要调整
    
    const resetDate = new Date(lastResetTime);
    const recordDate = new Date(recordCreatedAt);
    
    if (recordDate <= resetDate) {
      await addPostResetAdjustment(merchantType, merchantName, delta);
      console.log(`[BalanceLogService] postResetAdjustment applied: ${merchantType}/${merchantName} += ${delta}`);
    }
  } catch (error) {
    console.error('[BalanceLogService] applyPostResetAdjustmentIfNeeded failed:', error);
  }
}

/**
 * 记录订单创建时的余额变动
 */
export async function logOrderBalanceChange(params: {
  vendorName: string;
  providerName: string;
  cardWorth: number;
  paymentValue: number;
  actualPaid: number;
  currency: string;
  foreignRate: number;
  orderId: string;
  orderNumber: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { vendorName, providerName, cardWorth, paymentValue, orderId, orderNumber, operatorId, operatorName, currency } = params;

  try {
    const promises: Promise<any>[] = [];

    if (vendorName) {
      promises.push(createLedgerEntry({
        accountType: 'card_vendor', accountId: vendorName,
        sourceType: 'order', sourceId: `order_v_${orderId}`,
        amount: cardWorth,
        note: `订单收入: ${orderNumber}`,
        operatorId, operatorName,
      }));
    }

    if (providerName) {
      promises.push(createLedgerEntry({
        accountType: 'payment_provider', accountId: providerName,
        sourceType: 'order', sourceId: `order_p_${orderId}`,
        amount: -paymentValue,
        note: `订单支出: ${orderNumber} (${currency})`,
        operatorId, operatorName,
      }));
    }

    await Promise.all(promises);
    console.log('[BalanceLogService] Order balance change logged:', { orderNumber });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log order balance change:', error);
  }
}

/**
 * 记录订单取消/删除时的余额变动（反向记录）
 */
export async function logOrderCancelBalanceChange(params: {
  vendorName: string;
  providerName: string;
  cardWorth: number;
  paymentValue: number;
  currency: string;
  foreignRate: number;
  orderId: string;
  orderNumber: string;
  orderCreatedAt?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { vendorName, providerName, orderId, orderNumber, orderCreatedAt, operatorId, operatorName, cardWorth, paymentValue } = params;

  try {
    const promises: Promise<any>[] = [];

    if (vendorName) {
      promises.push(reverseAllEntriesForSource({
        accountType: 'card_vendor', accountId: vendorName,
        orderId, sourcePrefix: 'order_v_', adjPrefix: 'adj_v_',
        note: `撤回订单收入(含调整): ${orderNumber}`,
        operatorId, operatorName,
      }));
    }

    if (providerName) {
      promises.push(reverseAllEntriesForSource({
        accountType: 'payment_provider', accountId: providerName,
        orderId, sourcePrefix: 'order_p_', adjPrefix: 'adj_p_',
        note: `撤回订单支出(含调整): ${orderNumber}`,
        operatorId, operatorName,
      }));
    }

    await Promise.all(promises);
    
    // 重置前记录的取消调整
    if (orderCreatedAt) {
      const adjPromises: Promise<void>[] = [];
      if (vendorName) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('card_vendor', vendorName, orderCreatedAt, -cardWorth));
      }
      if (providerName) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('payment_provider', providerName, orderCreatedAt, paymentValue));
      }
      await Promise.all(adjPromises);
    }
    
    console.log('[BalanceLogService] Order cancel balance change logged:', { orderNumber });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log order cancel balance change:', error);
  }
}

/**
 * 记录活动赠送时的余额变动
 */
export async function logGiftBalanceChange(params: {
  providerName: string;
  giftValue: number;
  giftId: string;
  phoneNumber: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { providerName, giftValue, giftId, phoneNumber, operatorId, operatorName } = params;
  if (!providerName || giftValue <= 0) return;

  try {
    await createLedgerEntry({
      accountType: 'payment_provider', accountId: providerName,
      sourceType: 'gift', sourceId: `gift_${giftId}`,
      amount: -giftValue,
      note: `活动赠送: ${phoneNumber}`,
      operatorId, operatorName,
    });
    console.log('[BalanceLogService] Gift balance change logged:', { giftId });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log gift balance change:', error);
  }
}

/**
 * 记录赠送删除时的余额变动（反向记录）
 */
export async function logGiftDeleteBalanceChange(params: {
  providerName: string;
  giftValue: number;
  giftId: string;
  giftCreatedAt?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { providerName, giftValue, giftId, giftCreatedAt, operatorId, operatorName } = params;
  if (!providerName || giftValue <= 0) return;

  try {
    await reverseAllEntriesForSource({
      accountType: 'payment_provider', accountId: providerName,
      orderId: giftId, sourcePrefix: 'gift_', adjPrefix: 'gadj_',
      note: `赠送回收(含调整): ${giftId}`,
      operatorId, operatorName,
    });
    
    // 重置前赠送的删除调整
    if (giftCreatedAt) {
      await applyPostResetAdjustmentIfNeeded('payment_provider', providerName, giftCreatedAt, giftValue);
    }
    
    console.log('[BalanceLogService] Gift delete balance change logged:', { giftId });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log gift delete balance change:', error);
  }
}

/**
 * 记录订单恢复时的余额变动
 */
export async function logOrderRestoreBalanceChange(params: {
  vendorName: string;
  providerName: string;
  cardWorth: number;
  paymentValue: number;
  currency: string;
  foreignRate: number;
  orderId: string;
  orderNumber: string;
  orderCreatedAt?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { vendorName, providerName, cardWorth, paymentValue, currency, orderId, orderNumber, orderCreatedAt, operatorId, operatorName } = params;

  try {
    const promises: Promise<any>[] = [];

    if (vendorName) {
      promises.push(createLedgerEntry({
        accountType: 'card_vendor', accountId: vendorName,
        sourceType: 'op_log_restore', sourceId: `restore_v_${orderId}_${Date.now()}`,
        amount: cardWorth,
        note: `恢复订单收入: ${orderNumber}`,
        operatorId, operatorName,
      }));
    }

    if (providerName) {
      promises.push(createLedgerEntry({
        accountType: 'payment_provider', accountId: providerName,
        sourceType: 'op_log_restore', sourceId: `restore_p_${orderId}_${Date.now()}`,
        amount: -paymentValue,
        note: `恢复订单支出: ${orderNumber} (${currency})`,
        operatorId, operatorName,
      }));
    }

    await Promise.all(promises);
    
    // 重置前记录的恢复调整
    if (orderCreatedAt) {
      const adjPromises: Promise<void>[] = [];
      if (vendorName) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('card_vendor', vendorName, orderCreatedAt, cardWorth));
      }
      if (providerName) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('payment_provider', providerName, orderCreatedAt, -paymentValue));
      }
      await Promise.all(adjPromises);
    }
    
    console.log('[BalanceLogService] Order restore balance change logged:', { orderNumber });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log order restore balance change:', error);
  }
}

/**
 * 记录订单更新时的余额变动（差额调整）
 */
export async function logOrderUpdateBalanceChange(params: {
  vendorName: string;
  providerName: string;
  oldVendorName?: string;
  oldProviderName?: string;
  oldCardWorth: number;
  oldPaymentValue: number;
  oldCurrency: string;
  oldForeignRate: number;
  newCardWorth: number;
  newPaymentValue: number;
  newCurrency: string;
  newForeignRate: number;
  orderId: string;
  orderNumber: string;
  orderCreatedAt?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { 
    vendorName, providerName,
    oldVendorName, oldProviderName,
    oldCardWorth, oldPaymentValue, oldCurrency,
    newCardWorth, newPaymentValue, newCurrency,
    orderId, orderNumber, orderCreatedAt, operatorId, operatorName 
  } = params;

  const effectiveOldVendor = oldVendorName || vendorName;
  const effectiveOldProvider = oldProviderName || providerName;
  const vendorChanged = effectiveOldVendor !== vendorName;
  const providerChanged = effectiveOldProvider !== providerName;
  const cardWorthChanged = Math.abs(newCardWorth - oldCardWorth) > 0.01;
  const providerExpenseChanged = Math.abs(newPaymentValue - oldPaymentValue) > 0.01;
  
  if (!cardWorthChanged && !providerExpenseChanged && !vendorChanged && !providerChanged) return;

  try {
    // === Card vendor handling ===
    if (vendorChanged) {
      if (effectiveOldVendor) {
        await reverseAllEntriesForSource({
          accountType: 'card_vendor', accountId: effectiveOldVendor,
          orderId, sourcePrefix: 'order_v_', adjPrefix: 'adj_v_',
          note: `订单调整(商家变更撤回): ${orderNumber}`,
          operatorId, operatorName,
        });
      }
      if (vendorName) {
        await createLedgerEntry({
          accountType: 'card_vendor', accountId: vendorName,
          sourceType: 'order', sourceId: `order_v_${orderId}`,
          amount: newCardWorth,
          note: `订单调整(商家变更新增): ${orderNumber}`,
          operatorId, operatorName,
        });
      }
    } else if (vendorName && cardWorthChanged) {
      const cardWorthDiff = newCardWorth - oldCardWorth;
      await createAdjustmentEntry({
        accountType: 'card_vendor', accountId: vendorName,
        sourceType: 'order_adjustment', sourceId: `adj_v_${orderId}_${Date.now()}`,
        delta: cardWorthDiff,
        note: `订单调整: ${orderNumber} (卡价值: ${oldCardWorth.toFixed(2)} → ${newCardWorth.toFixed(2)})`,
        operatorId, operatorName,
      });
    }

    // === Payment provider handling ===
    if (providerChanged) {
      if (effectiveOldProvider) {
        await reverseAllEntriesForSource({
          accountType: 'payment_provider', accountId: effectiveOldProvider,
          orderId, sourcePrefix: 'order_p_', adjPrefix: 'adj_p_',
          note: `订单调整(商家变更撤回): ${orderNumber}`,
          operatorId, operatorName,
        });
      }
      if (providerName) {
        await createLedgerEntry({
          accountType: 'payment_provider', accountId: providerName,
          sourceType: 'order', sourceId: `order_p_${orderId}`,
          amount: -newPaymentValue,
          note: `订单调整(商家变更新增): ${orderNumber}`,
          operatorId, operatorName,
        });
      }
    } else if (providerName && providerExpenseChanged) {
      const expenseDiff = oldPaymentValue - newPaymentValue;
      await createAdjustmentEntry({
        accountType: 'payment_provider', accountId: providerName,
        sourceType: 'order_adjustment', sourceId: `adj_p_${orderId}_${Date.now()}`,
        delta: expenseDiff,
        note: `订单调整: ${orderNumber} (${oldCurrency}: ${oldPaymentValue.toFixed(2)} → ${newPaymentValue.toFixed(2)})`,
        operatorId, operatorName,
      });
    }

    // 重置前记录的编辑调整
    if (orderCreatedAt) {
      const adjPromises: Promise<void>[] = [];
      if (vendorChanged) {
        // 商家变更：旧商家需要减去旧金额，新商家需要加上新金额
        if (effectiveOldVendor) {
          adjPromises.push(applyPostResetAdjustmentIfNeeded('card_vendor', effectiveOldVendor, orderCreatedAt, -oldCardWorth));
        }
        if (vendorName) {
          adjPromises.push(applyPostResetAdjustmentIfNeeded('card_vendor', vendorName, orderCreatedAt, newCardWorth));
        }
      } else if (vendorName && cardWorthChanged) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('card_vendor', vendorName, orderCreatedAt, newCardWorth - oldCardWorth));
      }
      if (providerChanged) {
        // 商家变更：旧商家需要加回旧金额，新商家需要减去新金额
        if (effectiveOldProvider) {
          adjPromises.push(applyPostResetAdjustmentIfNeeded('payment_provider', effectiveOldProvider, orderCreatedAt, oldPaymentValue));
        }
        if (providerName) {
          adjPromises.push(applyPostResetAdjustmentIfNeeded('payment_provider', providerName, orderCreatedAt, -newPaymentValue));
        }
      } else if (providerName && providerExpenseChanged) {
        adjPromises.push(applyPostResetAdjustmentIfNeeded('payment_provider', providerName, orderCreatedAt, oldPaymentValue - newPaymentValue));
      }
      await Promise.all(adjPromises);
    }

    console.log('[BalanceLogService] Order update balance change logged:', { orderNumber });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log order update balance change:', error);
  }
}

/**
 * 🔧 修复：订单编辑后同步更新 member_activity
 */
export async function syncMemberActivityOnOrderEdit(params: {
  memberId: string;
  phoneNumber: string;
  oldActualPaid: number;
  oldProfit: number;
  oldCurrency: string;
  newActualPaid: number;
  newProfit: number;
  newCurrency: string;
}): Promise<boolean> {
  const {
    memberId, phoneNumber,
    oldActualPaid, oldProfit, oldCurrency,
    newActualPaid, newProfit, newCurrency,
  } = params;

  if (!memberId && !phoneNumber) {
    console.warn('[BalanceLogService] No member info for activity sync');
    return false;
  }

  try {
    const maBase = '/api/data/table/member_activity';
    const p = new URLSearchParams({ select: '*', single: 'true' });
    if (memberId) p.set('member_id', `eq.${memberId}`);
    else p.set('phone_number', `eq.${phoneNumber}`);

    const existingActivity = await apiGet<{
      id: string;
      total_accumulated_ngn?: number | null;
      total_accumulated_ghs?: number | null;
      total_accumulated_usdt?: number | null;
      accumulated_profit?: number | null;
      accumulated_profit_usdt?: number | null;
    } | null>(`${maBase}?${p.toString()}`);

    if (!existingActivity) {
      console.warn('[BalanceLogService] No activity record found for member:', memberId || phoneNumber);
      return true;
    }

    const updateData: Record<string, number | string> = {
      updated_at: new Date().toISOString(),
    };

    if (oldCurrency === newCurrency) {
      const amountDiff = newActualPaid - oldActualPaid;
      if (Math.abs(amountDiff) > 0.01) {
        if (newCurrency === 'NGN') {
          updateData.total_accumulated_ngn = Math.max(0, (existingActivity.total_accumulated_ngn || 0) + amountDiff);
        } else if (newCurrency === 'GHS') {
          updateData.total_accumulated_ghs = Math.max(0, (existingActivity.total_accumulated_ghs || 0) + amountDiff);
        } else if (newCurrency === 'USDT') {
          updateData.total_accumulated_usdt = Math.max(0, (existingActivity.total_accumulated_usdt || 0) + amountDiff);
        }
      }
    } else {
      // Currency changed - subtract old, add new
      if (oldCurrency === 'NGN') {
        updateData.total_accumulated_ngn = Math.max(0, (existingActivity.total_accumulated_ngn || 0) - oldActualPaid);
      } else if (oldCurrency === 'GHS') {
        updateData.total_accumulated_ghs = Math.max(0, (existingActivity.total_accumulated_ghs || 0) - oldActualPaid);
      } else if (oldCurrency === 'USDT') {
        updateData.total_accumulated_usdt = Math.max(0, (existingActivity.total_accumulated_usdt || 0) - oldActualPaid);
      }
      
      if (newCurrency === 'NGN') {
        updateData.total_accumulated_ngn = Math.max(0, (updateData.total_accumulated_ngn as number ?? existingActivity.total_accumulated_ngn ?? 0) + newActualPaid);
      } else if (newCurrency === 'GHS') {
        updateData.total_accumulated_ghs = Math.max(0, (updateData.total_accumulated_ghs as number ?? existingActivity.total_accumulated_ghs ?? 0) + newActualPaid);
      } else if (newCurrency === 'USDT') {
        updateData.total_accumulated_usdt = Math.max(0, (updateData.total_accumulated_usdt as number ?? existingActivity.total_accumulated_usdt ?? 0) + newActualPaid);
      }
    }

    // Update profit - 按币种分流：USDT 更新 accumulated_profit_usdt，NGN/GHS 更新 accumulated_profit
    const profitDiff = newProfit - oldProfit;
    if (Math.abs(profitDiff) > 0.01) {
      if (oldCurrency === newCurrency) {
        if (newCurrency === 'USDT') {
          updateData.accumulated_profit_usdt = Math.max(0, (existingActivity.accumulated_profit_usdt || 0) + profitDiff);
        } else {
          updateData.accumulated_profit = Math.max(0, (existingActivity.accumulated_profit || 0) + profitDiff);
        }
      } else {
        // 币种变更：从旧币种扣减，向新币种加回
        if (oldCurrency === 'USDT') {
          updateData.accumulated_profit_usdt = Math.max(0, (existingActivity.accumulated_profit_usdt || 0) - oldProfit);
        } else {
          updateData.accumulated_profit = Math.max(0, (existingActivity.accumulated_profit || 0) - oldProfit);
        }
        if (newCurrency === 'USDT') {
          updateData.accumulated_profit_usdt = Math.max(0, (updateData.accumulated_profit_usdt as number ?? existingActivity.accumulated_profit_usdt ?? 0) + newProfit);
        } else {
          updateData.accumulated_profit = Math.max(0, (updateData.accumulated_profit as number ?? existingActivity.accumulated_profit ?? 0) + newProfit);
        }
      }
    }

    await apiPatch(`${maBase}?id=eq.${encodeURIComponent(String(existingActivity.id))}`, {
      data: updateData,
    });

    return true;
  } catch (error) {
    console.error('[BalanceLogService] syncMemberActivityOnOrderEdit failed:', error);
    return false;
  }
}

/**
 * 记录赠送编辑时的余额变动（差额调整）
 */
export async function logGiftUpdateBalanceChange(params: {
  providerName: string;
  oldGiftValue: number;
  newGiftValue: number;
  giftId: string;
  giftCreatedAt?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { providerName, oldGiftValue, newGiftValue, giftId, giftCreatedAt, operatorId, operatorName } = params;
  if (!providerName) return;
  
  const delta = newGiftValue - oldGiftValue;
  if (Math.abs(delta) < 0.01) return;
  
  try {
    await createAdjustmentEntry({
      accountType: 'payment_provider', accountId: providerName,
      sourceType: 'gift_adjustment', sourceId: `gadj_${giftId}_${Date.now()}`,
      delta: -delta,
      note: `赠送调整: ${oldGiftValue.toFixed(2)} → ${newGiftValue.toFixed(2)}`,
      operatorId, operatorName,
    });
    
    // 重置前赠送的编辑调整
    if (giftCreatedAt) {
      await applyPostResetAdjustmentIfNeeded('payment_provider', providerName, giftCreatedAt, oldGiftValue - newGiftValue);
    }
    
    console.log('[BalanceLogService] Gift update balance change logged:', { giftId, delta });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log gift update balance change:', error);
  }
}

/**
 * 记录赠送恢复时的余额变动（从操作日志恢复）
 */
export async function logGiftRestoreBalanceChange(params: {
  providerName: string;
  giftValue: number;
  giftId: string;
  giftCreatedAt?: string;
  phoneNumber?: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { providerName, giftValue, giftId, giftCreatedAt, phoneNumber, operatorId, operatorName } = params;
  if (!providerName || giftValue <= 0) return;

  try {
    await createLedgerEntry({
      accountType: 'payment_provider', accountId: providerName,
      sourceType: 'op_log_restore', sourceId: `grestore_${giftId}_${Date.now()}`,
      amount: -giftValue,
      note: `恢复赠送: ${phoneNumber || giftId}`,
      operatorId, operatorName,
    });
    
    // 重置前赠送的恢复调整
    if (giftCreatedAt) {
      await applyPostResetAdjustmentIfNeeded('payment_provider', providerName, giftCreatedAt, -giftValue);
    }
    
    console.log('[BalanceLogService] Gift restore balance change logged:', { giftId });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log gift restore balance change:', error);
  }
}

/**
 * 记录充值恢复时的余额变动（从操作日志恢复）
 */
export async function logRechargeRestoreBalanceChange(params: {
  providerName: string;
  rechargeAmount: number;
  rechargeId: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { providerName, rechargeAmount, rechargeId, operatorId, operatorName } = params;
  if (!providerName || rechargeAmount <= 0) return;

  try {
    await createLedgerEntry({
      accountType: 'payment_provider', accountId: providerName,
      sourceType: 'op_log_restore', sourceId: `rcrestore_${rechargeId}_${Date.now()}`,
      amount: rechargeAmount,
      note: `恢复充值: ${rechargeAmount.toFixed(2)}`,
      operatorId, operatorName,
    });
    console.log('[BalanceLogService] Recharge restore balance change logged:', { rechargeId });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log recharge restore balance change:', error);
  }
}

/**
 * 记录提款恢复时的余额变动（从操作日志恢复）
 */
export async function logWithdrawalRestoreBalanceChange(params: {
  vendorName: string;
  withdrawalAmount: number;
  withdrawalId: string;
  operatorId?: string;
  operatorName?: string;
}): Promise<void> {
  const { vendorName, withdrawalAmount, withdrawalId, operatorId, operatorName } = params;
  if (!vendorName || withdrawalAmount <= 0) return;

  try {
    await createLedgerEntry({
      accountType: 'card_vendor', accountId: vendorName,
      sourceType: 'op_log_restore', sourceId: `wdrestore_${withdrawalId}_${Date.now()}`,
      amount: -withdrawalAmount,
      note: `恢复提款: ${withdrawalAmount.toFixed(2)}`,
      operatorId, operatorName,
    });
    console.log('[BalanceLogService] Withdrawal restore balance change logged:', { withdrawalId });
  } catch (error) {
    console.error('[BalanceLogService] Failed to log withdrawal restore balance change:', error);
  }
}
