// ============= Points Service - 积分明细核心服务 =============
// 积分明细是"事件驱动型数据"，所有积分明细都来源于「订单新增」这一事件
// 积分状态与订单状态强绑定（正常 → 已发放，取消/删除 → 已回收）
// 读写走后端 API

import { apiGet, apiPost } from '@/api/client';
import { CurrencyCode } from '@/config/currencies';
import { getPointsSettingsAsync, PointsSettings } from '@/services/points/pointsSettingsService';
import { logOperation } from '@/services/audit/auditLogService';
import { loadSharedData } from '@/services/finance/sharedDataService';
import { notifyDataMutation } from '@/services/system/dataRefreshManager';
import { logger } from '@/lib/logger';

// ============= 积分类型 =============
// 系统内仅存在三种积分类型
export type PointsTransactionType = 
  | 'consumption'      // 消费积分（订单积分）
  | 'referral_1'       // 推荐积分1（固定值）
  | 'referral_2';      // 推荐积分2（按消费积分比例）

export type PointsStatus = 'issued' | 'reversed';

// ============= 积分明细数据结构 =============
export interface PointsEntry {
  id: string;
  created_at: string;           // 获得时间
  member_code: string;          // 会员编号
  phone_number: string;         // 电话号码
  order_id: string | null;      // 订单ID（必须与订单表的id字段匹配）
  transaction_type: PointsTransactionType;  // 类型
  actual_payment: number | null;     // 实付外币（消费积分使用）
  currency: string | null;           // 币种（消费积分使用）
  exchange_rate: number | null;      // 当时汇率（消费积分使用）
  usd_amount: number | null;         // 兑换USD（消费积分使用）
  points_multiplier: number | null;  // 积分倍率（消费积分使用）
  points_earned: number;             // 获得积分
  status: PointsStatus;              // 状态：已发放/已回收
  creator_id: string | null;         // 创建人ID（姓名通过ID实时获取，不存储name快照）
}

// ============= 推荐人查找结果 =============
interface ReferrerInfo {
  memberCode: string;
  phoneNumber: string;
}

// ============= 获取汇率快照（从积分设置中获取当时汇率）=============
function getExchangeRate(currency: CurrencyCode, settings: PointsSettings): number {
  switch (currency) {
    case 'NGN':
      return settings.ngnToUsdRate || 1;
    case 'GHS':
      return settings.ghsToUsdRate || 1;
    case 'USDT':
      return 1;
    default:
      return 1;
  }
}

// ============= 查找推荐人 =============
async function findReferrer(orderPhoneNumber: string): Promise<ReferrerInfo | null> {
  try {
    const data = await apiGet<{ referrer_phone: string; referrer_member_code: string } | null>(
      `/api/members/referrer-by-phone/${encodeURIComponent(orderPhoneNumber)}`
    );

    if (!data?.referrer_phone) {
      logger.log(`[PointsService] No referrer found for phone: ${orderPhoneNumber}`);
      return null;
    }

    logger.log(`[PointsService] Found referrer for ${orderPhoneNumber}:`, data);
    return {
      memberCode: data.referrer_member_code,
      phoneNumber: data.referrer_phone,
    };
  } catch (error) {
    logger.error('[PointsService] Failed to find referrer:', error);
    return null;
  }
}

// ============= 创建积分明细入口 =============
export interface CreatePointsParams {
  orderId: string;           // 订单ID（数据库UUID，必须与orders表的id字段一致）
  orderPhoneNumber: string;  // 订单电话号码
  memberCode: string;        // 下单会员编号
  actualPayment: number;     // 实付外币金额
  currency: CurrencyCode;    // 需求币种
  creatorId?: string;        // 创建人ID（只存ID，姓名通过ID实时获取）
}

export interface CreatePointsResult {
  consumptionPoints: number;     // 消费积分
  referral1Points: number;       // 推荐积分1
  referral2Points: number;       // 推荐积分2
  referrerMemberCode?: string;   // 推荐人会员编号
  success: boolean;
}

// ============= SECTION_CREATE_POINTS =============

/**
 * 订单新增时创建积分明细
 * 
 * 严格执行生成顺序：
 * 1. 计算并写入【消费积分】（落库）
 * 2. 若开启推荐模式1 → 写入推荐积分1
 * 3. 若开启推荐模式2 → 基于已落库的消费积分写入推荐积分2
 * 
 * 所有积分记录必须绑定 order_id（订单表的UUID）
 */
export async function createPointsOnOrderCreate(params: CreatePointsParams): Promise<CreatePointsResult> {
  const result: CreatePointsResult = {
    consumptionPoints: 0,
    referral1Points: 0,
    referral2Points: 0,
    success: false,
  };

  try {
    // ⚠️ 重要：直接从数据库读取积分设置，绕过缓存确保获取最新设置
    const DEFAULT_SETTINGS: PointsSettings = {
      mode: 'auto',
      ngnToUsdRate: 1580,
      ghsToUsdRate: 15.5,
      usdToPointsRate: 1,
      ngnFormulaMultiplier: 1,
      ghsFormulaMultiplier: 1,
      usdtFormulaMultiplier: 1,
      usdtCoefficient: 1,
      lastAutoUpdate: '',
      lastManualUpdate: '',
      lastFetchedNgnRate: 1580,
      lastFetchedGhsRate: 15.5,
      referralPointsPerAction: 1,
      consumptionPointsPerAction: 1,
      referralMode1Enabled: true,
      referralMode: 'mode1',
      referralMode2Percentage: 10,
      referralMode2Enabled: false,
      referralActivityEnabled: true,
    };
    
    // 🚀 优化：并行获取积分设置和推荐人信息（通过 tenant-aware API 确保租户隔离）
    const [freshSettings, referrer] = await Promise.all([
      getPointsSettingsAsync(),
      findReferrer(params.orderPhoneNumber),
    ]);
    
    const settings: PointsSettings = freshSettings
      ? { ...DEFAULT_SETTINGS, ...freshSettings }
      : DEFAULT_SETTINGS;
    
    logger.log('[PointsService] Creating points with FRESH settings from DB:', {
      referralMode1Enabled: settings.referralMode1Enabled,
      referralMode2Enabled: settings.referralMode2Enabled,
      referralPointsPerAction: settings.referralPointsPerAction,
      referralMode2Percentage: settings.referralMode2Percentage,
      usdToPointsRate: settings.usdToPointsRate,
      hasReferrer: !!referrer,
    });
    
    // 验证必要参数
    if (!params.memberCode || !params.orderPhoneNumber) {
      logger.warn('[PointsService] Missing member_code or phone, skipping');
      return result;
    }

    if (params.actualPayment <= 0) {
      logger.warn('[PointsService] actualPayment <= 0, skipping');
      return result;
    }

    // ============= 第一步：创建消费积分（必须先落库）=============
    const exchangeRate = getExchangeRate(params.currency, settings);
    const usdAmount = params.actualPayment / exchangeRate;
    const pointsMultiplier = settings.usdToPointsRate || 1;
    const consumptionPoints = Math.floor(usdAmount * pointsMultiplier);

    logger.log('[PointsService] Consumption points calculation:', {
      actualPayment: params.actualPayment,
      currency: params.currency,
      exchangeRate,
      usdAmount,
      pointsMultiplier,
      consumptionPoints,
    });

    if (consumptionPoints > 0) {
      const consumptionEntry = {
        member_code: params.memberCode,
        phone_number: params.orderPhoneNumber,
        order_id: params.orderId,
        transaction_type: 'consumption',
        actual_payment: params.actualPayment,
        currency: params.currency,
        exchange_rate: exchangeRate,
        usd_amount: usdAmount,
        points_multiplier: pointsMultiplier,
        points_earned: consumptionPoints,
        status: 'issued',
        creator_id: params.creatorId || null,
      };

      await apiPost('/api/points/ledger', consumptionEntry);

      result.consumptionPoints = consumptionPoints;
      logger.log('[PointsService] Consumption points created:', consumptionPoints);

      // 🚀 优化：异步日志记录，不阻塞主流程
      logOperation(
        'activity_gift',
        'create',
        params.orderId,
        null,
        consumptionEntry,
        `会员 ${params.memberCode} 获得消费积分 ${consumptionPoints}`
      );

      // 🚀 优化：使用 fire-and-forget Webhook 触发
      import('@/services/webhookService').then(({ triggerPointsIssuedAsync }) => {
        triggerPointsIssuedAsync({
          memberId: undefined,
          memberCode: params.memberCode,
          phoneNumber: params.orderPhoneNumber,
          points: consumptionPoints,
          transactionType: 'consumption',
          currency: params.currency,
          createdAt: new Date().toISOString(),
        });
      });
    }

    // ============= 第二步：并行处理推荐积分和会员活动更新 =============
    const parallelTasks: Promise<void>[] = [];

    // 任务1：更新下单会员的活动积分（如有消费积分）
    if (consumptionPoints > 0) {
      parallelTasks.push(
        updateMemberActivityForConsumption(params.orderPhoneNumber, consumptionPoints)
      );
    }

    // 任务2-4：处理推荐人相关积分（需推荐活动总开关开启）
    if (referrer && settings.referralActivityEnabled !== false) {
      result.referrerMemberCode = referrer.memberCode;
      logger.log('[PointsService] Found referrer:', referrer);

      // 推荐积分1
      if (settings.referralMode1Enabled === true) {
        const referral1Points = settings.referralPointsPerAction || 1;
        if (referral1Points > 0) {
          parallelTasks.push(
            createReferralPoints(
              referrer,
              params.orderId,
              'referral_1',
              referral1Points,
              params.creatorId
            ).then(success => {
              if (success) result.referral1Points = referral1Points;
            })
          );
        }
      }

      // 🚀 优化：推荐积分2不再重新查询数据库，直接使用已计算的消费积分
      if (settings.referralMode2Enabled === true && consumptionPoints > 0) {
        const percentage = settings.referralMode2Percentage || 10;
        const referral2Points = Math.floor(consumptionPoints * (percentage / 100));
        
        if (referral2Points > 0) {
          parallelTasks.push(
            createReferralPoints(
              referrer,
              params.orderId,
              'referral_2',
              referral2Points,
              params.creatorId,
              consumptionPoints,
              percentage
            ).then(success => {
              if (success) result.referral2Points = referral2Points;
            })
          );
        }
      }
    }

    // 🚀 并行执行所有任务
    await Promise.all(parallelTasks);

    // ============= 第三步：更新推荐人的活动积分（单独处理，因为依赖推荐积分结果）=============
    if (referrer && settings.referralActivityEnabled !== false) {
      const totalReferralPoints = result.referral1Points + result.referral2Points;
      if (totalReferralPoints > 0) {
        // 🚀 优化：使用 fire-and-forget 方式更新推荐人积分
        updateReferrerActivityAsync(referrer, totalReferralPoints);
      }
    }

    result.success = true;
    logger.log('[PointsService] Points creation completed:', result);
    notifyDataMutation({ table: 'points_ledger', operation: 'INSERT', source: 'mutation' }).catch(logger.error);
    notifyDataMutation({ table: 'member_activity', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
    return result;
  } catch (error) {
    logger.error('[PointsService] Failed to create points on order:', error);
    return result;
  }
}

// ============= SECTION_HELPERS =============

// ============= 辅助函数：更新下单会员的消费积分 (🚀 优化版) =============
async function updateMemberActivityForConsumption(
  phoneNumber: string,
  consumptionPoints: number
): Promise<void> {
  try {
    await apiPost('/api/points/member-activity/add-consumption', {
      phone_number: phoneNumber,
      consumption_points: consumptionPoints,
    });
  } catch (error) {
    logger.error('[PointsService] Error updating member activity:', error);
  }
}

// ============= 辅助函数：创建推荐积分 =============
async function createReferralPoints(
  referrer: ReferrerInfo,
  orderId: string,
  transactionType: 'referral_1' | 'referral_2',
  points: number,
  creatorId?: string,
  consumptionPoints?: number,
  percentage?: number
): Promise<boolean> {
  try {
    const entry = {
      member_code: referrer.memberCode,
      phone_number: referrer.phoneNumber,
      order_id: orderId,
      transaction_type: transactionType,
      actual_payment: null,
      currency: null,
      exchange_rate: null,
      usd_amount: null,
      points_multiplier: null,
      points_earned: points,
      status: 'issued',
      creator_id: creatorId || null,
    };

    await apiPost('/api/points/ledger', entry);

    logger.log(`[PointsService] ${transactionType} points created:`, points);

    // 异步日志
    const description = transactionType === 'referral_1'
      ? `推荐人 ${referrer.memberCode} 获得推荐积分1 ${points}`
      : `推荐人 ${referrer.memberCode} 获得推荐积分2 ${points} (消费积分${consumptionPoints}的${percentage}%)`;
    
    logOperation('activity_gift', 'create', orderId, null, entry, description);

    // Fire-and-forget Webhook
    import('@/services/webhookService').then(({ triggerPointsIssuedAsync }) => {
      triggerPointsIssuedAsync({
        memberId: undefined,
        memberCode: referrer.memberCode,
        phoneNumber: referrer.phoneNumber,
        points,
        transactionType,
        currency: undefined,
        createdAt: new Date().toISOString(),
      });
    });

    return true;
  } catch (error) {
    logger.error(`[PointsService] Error creating ${transactionType} points:`, error);
    return false;
  }
}

// ============= 辅助函数：异步更新推荐人活动积分 =============
function updateReferrerActivityAsync(referrer: ReferrerInfo, totalReferralPoints: number): void {
  setTimeout(async () => {
    try {
      await apiPost('/api/points/member-activity/add-referral', {
        phone_number: referrer.phoneNumber,
        referral_points: totalReferralPoints,
      });

      logger.log('[PointsService] Referrer activity updated:', {
        referrer: referrer.phoneNumber,
        points: totalReferralPoints,
      });
    } catch (error) {
      logger.error('[PointsService] Error updating referrer activity:', error);
    }
  }, 0);
}

// ============= SECTION_REVERSE =============

/**
 * 订单取消/删除时回收积分
 * 
 * ⚠️ 强制规则（不可协商）：
 * 1. 只要积分流水状态为"已回收"，积分变动必须为负数（减法）
 * 2. 订单删除时：
 *    - 必须新增一条积分流水
 *    - 积分变动 = -原订单产生的积分
 *    - 状态 = 已回收
 *    - 关联同一个 order_id
 * 3. 同步更新会员活动数据：
 *    - remaining_points 必须扣减
 *    - 对应推荐/消费奖励字段同步扣减
 * 4. 禁止只改状态不改积分数值
 */
export async function reversePointsOnOrderCancel(orderId: string): Promise<boolean> {
  try {
    logger.log('[PointsService] Reversing points for order:', orderId);
    
    const result = await apiPost<{ success: boolean }>('/api/points/reverse-on-order-cancel', {
      order_id: orderId,
    });

    if (result?.success) {
      logger.log('[PointsService] Points reversal completed for order:', orderId);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
      notifyDataMutation({ table: 'member_activity', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
      return true;
    }

    return false;
  } catch (error) {
    logger.error('[PointsService] Failed to reverse points:', error);
    return false;
  }
}

// ============= SECTION_RESTORE =============

/**
 * 订单恢复时重新发放积分
 * 当取消的订单被恢复时，恢复积分
 * 
 * 重要逻辑修复：
 * - 订单取消时，会为每条正积分创建对应的负积分流水（status='reversed'）
 * - 订单恢复时，应该删除这些负积分流水，而不是重新创建正积分
 * - 这样可以避免积分重复发放的bug
 * - 必须同时恢复消费者和推荐人的积分
 */
export async function restorePointsOnOrderRestore(params: CreatePointsParams): Promise<CreatePointsResult> {
  logger.log('[PointsService] Restoring points for order:', params.orderId);
  
  const result: CreatePointsResult = {
    consumptionPoints: 0,
    referral1Points: 0,
    referral2Points: 0,
    success: false,
  };

  try {
    const apiResult = await apiPost<CreatePointsResult>('/api/points/restore-on-order-restore', {
      order_id: params.orderId,
      order_phone_number: params.orderPhoneNumber,
      member_code: params.memberCode,
      actual_payment: params.actualPayment,
      currency: params.currency,
      creator_id: params.creatorId || null,
    });

    if (apiResult) {
      result.consumptionPoints = apiResult.consumptionPoints || 0;
      result.referral1Points = apiResult.referral1Points || 0;
      result.referral2Points = apiResult.referral2Points || 0;
      result.referrerMemberCode = apiResult.referrerMemberCode;
      result.success = apiResult.success || false;
    }

    if (result.success) {
      logger.log('[PointsService] Points restoration completed:', result);
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
      notifyDataMutation({ table: 'member_activity', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
    }

    return result;
  } catch (error) {
    logger.error('[PointsService] Failed to restore points:', error);
    return result;
  }
}

// ============= SECTION_ADJUST =============

// ============= 订单编辑时积分差额调整 =============

export interface AdjustPointsOnEditParams {
  orderId: string;           // 订单数据库UUID
  memberCode: string;
  phoneNumber: string;
  oldActualPayment: number;
  oldCurrency: CurrencyCode;
  newActualPayment: number;
  newCurrency: CurrencyCode;
  creatorId?: string;
}

/**
 * 订单编辑时自动调整积分
 * 
 * 逻辑：
 * 1. 查询该订单已发放的消费积分总和（正积分issued + 负积分reversed 的 net）
 * 2. 根据新的 actualPayment + currency 重新计算应得积分
 * 3. 计算差额 delta = newPoints - currentNetPoints
 * 4. 如果 delta > 0，插入一条正积分记录（补发）
 * 5. 如果 delta < 0，插入一条负积分记录（扣减）
 * 6. 更新 orders.order_points 和 member_activity
 * 7. 记录操作日志
 */
export async function adjustPointsOnOrderEdit(params: AdjustPointsOnEditParams): Promise<{ delta: number; success: boolean }> {
  const {
    orderId, memberCode, phoneNumber,
    creatorId,
  } = params;

  // ⚠️ 强制 parseFloat 确保数值类型正确
  const newActualPayment = typeof params.newActualPayment === 'string' 
    ? parseFloat(params.newActualPayment) || 0 
    : (params.newActualPayment || 0);
  const newCurrency = params.newCurrency;

  logger.warn('[PointsService] ===== adjustPointsOnOrderEdit CALLED =====', {
    orderId, memberCode, phoneNumber,
    rawNewActualPayment: params.newActualPayment,
    parsedNewActualPayment: newActualPayment,
    rawOldActualPayment: params.oldActualPayment,
    newCurrency,
    oldCurrency: params.oldCurrency,
    typeOfNewPayment: typeof params.newActualPayment,
  });

  try {
    const result = await apiPost<{ delta: number; success: boolean }>('/api/points/adjust-on-order-edit', {
      order_id: orderId,
      member_code: memberCode,
      phone_number: phoneNumber,
      old_actual_payment: params.oldActualPayment,
      old_currency: params.oldCurrency,
      new_actual_payment: newActualPayment,
      new_currency: newCurrency,
      creator_id: creatorId || null,
    });

    if (result?.success) {
      logger.warn('[PointsService] ===== Points adjustment COMPLETED =====', { delta: result.delta });
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
      notifyDataMutation({ table: 'member_activity', operation: 'UPDATE', source: 'mutation' }).catch(logger.error);
      return { delta: result.delta, success: true };
    }

    return { delta: 0, success: false };
  } catch (error) {
    logger.error('[PointsService] adjustPointsOnOrderEdit FAILED:', error);
    return { delta: 0, success: false };
  }
}

// ============= SECTION_QUERIES =============

// ============= 查询函数 =============

/**
 * 获取会员积分余额
 * 规则：累加所有积分流水（正积分发放 + 负积分回收）
 * 正积分永远是已发放，负积分代表回收
 */
// 对应已有路由: GET /api/points/member/:memberId
export async function getMemberPointsBalance(memberCode: string, lastResetTime?: string | null): Promise<number> {
  try {
    const params = new URLSearchParams();
    if (lastResetTime) params.set('last_reset_time', lastResetTime);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const data = await apiGet<{ balance: number }>(
      `/api/points/member/${encodeURIComponent(memberCode)}/balance${queryStr}`
    );

    return data?.balance ?? 0;
  } catch (error) {
    logger.error('[PointsService] Failed to calculate member points:', error);
    return 0;
  }
}

/**
 * 检查订单是否已发放积分
 */
export async function hasOrderEarnedPoints(orderId: string): Promise<boolean> {
  try {
    const data = await apiGet<{ hasEarned: boolean }>(
      `/api/points/order/${encodeURIComponent(orderId)}/has-earned`
    );
    return data?.hasEarned ?? false;
  } catch (error) {
    logger.error('[PointsService] Failed to check order points:', error);
    return false;
  }
}

/**
 * 获取订单相关的积分明细
 */
export async function getOrderPointsEntries(orderId: string): Promise<PointsEntry[]> {
  try {
    const data = await apiGet<PointsEntry[]>(
      `/api/points/order/${encodeURIComponent(orderId)}/entries`
    );
    return data || [];
  } catch (error) {
    logger.error('[PointsService] Failed to get order points entries:', error);
    return [];
  }
}

/**
 * 获取会员的积分明细
 */
// 对应已有路由: GET /api/points/member/:memberId/breakdown
export async function getMemberPointsEntries(memberCode: string): Promise<PointsEntry[]> {
  try {
    const data = await apiGet<PointsEntry[]>(
      `/api/points/member/${encodeURIComponent(memberCode)}/breakdown`
    );
    return data || [];
  } catch (error) {
    logger.error('[PointsService] Failed to get member points entries:', error);
    return [];
  }
}

// ============= SECTION_LABELS =============

/**
 * 获取积分类型标签
 */
export function getPointsTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'consumption': '消费积分',
    'referral_1': '推荐积分1',
    'referral_2': '推荐积分2',
  };
  return labels[type] || type;
}

/**
 * 获取积分状态标签
 */
export function getPointsStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'issued': '已发放',
    'reversed': '已回收',
  };
  return labels[status] || status;
}
