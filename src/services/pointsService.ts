// ============= Points Service - 积分明细核心服务 =============
// 积分明细是"事件驱动型数据"，所有积分明细都来源于「订单新增」这一事件
// 积分状态与订单状态强绑定（正常 → 已发放，取消/删除 → 已回收）

import { supabase } from '@/integrations/supabase/client';
import { CurrencyCode } from '@/config/currencies';
import { getPointsSettingsAsync, PointsSettings } from '@/stores/pointsSettingsStore';
import { logOperation } from '@/stores/auditLogStore';
import { loadSharedData } from '@/services/sharedDataService';

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
// 读取订单中的电话号码 → 在推荐关系表中匹配 → 获取推荐人信息
async function findReferrer(orderPhoneNumber: string): Promise<ReferrerInfo | null> {
  try {
    // 从 referral_relations 表中查找该电话号码对应的推荐人
    // 使用 maybeSingle() 避免在无记录时抛出错误
    const { data: referralRelation, error } = await supabase
      .from('referral_relations')
      .select('referrer_phone, referrer_member_code')
      .eq('referee_phone', orderPhoneNumber)
      .maybeSingle();

    if (error) {
      console.error(`[PointsService] Error finding referrer for phone ${orderPhoneNumber}:`, error);
      return null;
    }
    
    if (!referralRelation) {
      console.log(`[PointsService] No referrer found for phone: ${orderPhoneNumber}`);
      return null;
    }

    console.log(`[PointsService] Found referrer for ${orderPhoneNumber}:`, referralRelation);
    return {
      memberCode: referralRelation.referrer_member_code,
      phoneNumber: referralRelation.referrer_phone,
    };
  } catch (error) {
    console.error('[PointsService] Failed to find referrer:', error);
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
    
    // 🚀 优化：并行获取积分设置和推荐人信息
    const [settingsResult, referrer] = await Promise.all([
      supabase
        .from('shared_data_store')
        .select('data_value')
        .eq('data_key', 'points_settings')
        .single(),
      findReferrer(params.orderPhoneNumber),
    ]);
    
    const settings: PointsSettings = settingsResult.data?.data_value 
      ? { ...DEFAULT_SETTINGS, ...(settingsResult.data.data_value as Partial<PointsSettings>) }
      : DEFAULT_SETTINGS;
    
    console.log('[PointsService] Creating points with FRESH settings from DB:', {
      referralMode1Enabled: settings.referralMode1Enabled,
      referralMode2Enabled: settings.referralMode2Enabled,
      referralPointsPerAction: settings.referralPointsPerAction,
      referralMode2Percentage: settings.referralMode2Percentage,
      usdToPointsRate: settings.usdToPointsRate,
      hasReferrer: !!referrer,
    });
    
    // 验证必要参数
    if (!params.memberCode || !params.orderPhoneNumber) {
      console.warn('[PointsService] Missing member_code or phone, skipping');
      return result;
    }

    if (params.actualPayment <= 0) {
      console.warn('[PointsService] actualPayment <= 0, skipping');
      return result;
    }

    // ============= 第一步：创建消费积分（必须先落库）=============
    const exchangeRate = getExchangeRate(params.currency, settings);
    const usdAmount = params.actualPayment / exchangeRate;
    const pointsMultiplier = settings.usdToPointsRate || 1;
    const consumptionPoints = Math.floor(usdAmount * pointsMultiplier);

    console.log('[PointsService] Consumption points calculation:', {
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

      const { error: consumptionError } = await supabase
        .from('points_ledger')
        .insert(consumptionEntry);

      if (consumptionError) {
        console.error('[PointsService] Failed to create consumption points:', consumptionError);
        throw consumptionError;
      }

      result.consumptionPoints = consumptionPoints;
      console.log('[PointsService] Consumption points created:', consumptionPoints);

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

    // 任务2-4：处理推荐人相关积分
    if (referrer) {
      result.referrerMemberCode = referrer.memberCode;
      console.log('[PointsService] Found referrer:', referrer);

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
    if (referrer) {
      const totalReferralPoints = result.referral1Points + result.referral2Points;
      if (totalReferralPoints > 0) {
        // 🚀 优化：使用 fire-and-forget 方式更新推荐人积分
        updateReferrerActivityAsync(referrer, totalReferralPoints);
      }
    }

    result.success = true;
    console.log('[PointsService] Points creation completed:', result);
    return result;
  } catch (error) {
    console.error('[PointsService] Failed to create points on order:', error);
    return result;
  }
}

// ============= 辅助函数：更新下单会员的消费积分 (🚀 优化版) =============
async function updateMemberActivityForConsumption(
  phoneNumber: string,
  consumptionPoints: number
): Promise<void> {
  try {
    // 🚀 直接尝试更新，利用 Postgres 的 COALESCE 处理 NULL
    const { data: updateResult, error: updateError } = await supabase
      .from('member_activity')
      .update({
        remaining_points: supabase.rpc ? undefined : consumptionPoints, // 占位，实际用 raw SQL
        updated_at: new Date().toISOString(),
      })
      .eq('phone_number', phoneNumber)
      .select('id')
      .maybeSingle();

    // 如果更新成功（记录存在）
    if (!updateError && updateResult) {
      // 使用 RPC 或直接 SQL 增量更新更高效，但这里简化处理
      const { data: existingActivity } = await supabase
        .from('member_activity')
        .select('id, remaining_points, accumulated_points')
        .eq('phone_number', phoneNumber)
        .single();

      if (existingActivity) {
        await supabase
          .from('member_activity')
          .update({
            remaining_points: (existingActivity.remaining_points || 0) + consumptionPoints,
            accumulated_points: (existingActivity.accumulated_points || 0) + consumptionPoints,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingActivity.id);
      }
      return;
    }

    // 🚀 快速路径：先查询是否存在
    const { data: existingActivity } = await supabase
      .from('member_activity')
      .select('id, remaining_points, accumulated_points')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (existingActivity) {
      await supabase
        .from('member_activity')
        .update({
          remaining_points: (existingActivity.remaining_points || 0) + consumptionPoints,
          accumulated_points: (existingActivity.accumulated_points || 0) + consumptionPoints,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingActivity.id);
    } else {
      // 创建新活动记录
      const { data: memberData } = await supabase
        .from('members')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle();

      await supabase.from('member_activity').insert({
        member_id: memberData?.id || null,
        phone_number: phoneNumber,
        remaining_points: consumptionPoints,
        accumulated_points: consumptionPoints,
        referral_points: 0,
        referral_count: 0,
      });
    }
  } catch (error) {
    console.error('[PointsService] Error updating member activity:', error);
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

    const { error } = await supabase.from('points_ledger').insert(entry);

    if (error) {
      console.error(`[PointsService] Failed to create ${transactionType} points:`, error);
      return false;
    }

    console.log(`[PointsService] ${transactionType} points created:`, points);

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
    console.error(`[PointsService] Error creating ${transactionType} points:`, error);
    return false;
  }
}

// ============= 辅助函数：异步更新推荐人活动积分 =============
function updateReferrerActivityAsync(referrer: ReferrerInfo, totalReferralPoints: number): void {
  setTimeout(async () => {
    try {
      const { data: existingActivity, error: fetchError } = await supabase
        .from('member_activity')
        .select('id, remaining_points, referral_points, referral_count')
        .eq('phone_number', referrer.phoneNumber)
        .maybeSingle();

      if (fetchError) {
        console.error('[PointsService] Failed to fetch referrer activity:', fetchError);
        return;
      }

      if (existingActivity) {
        await supabase
          .from('member_activity')
          .update({
            remaining_points: (existingActivity.remaining_points || 0) + totalReferralPoints,
            referral_points: (existingActivity.referral_points || 0) + totalReferralPoints,
            referral_count: (existingActivity.referral_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingActivity.id);
      } else {
        const { data: referrerMember } = await supabase
          .from('members')
          .select('id')
          .eq('phone_number', referrer.phoneNumber)
          .maybeSingle();

        await supabase.from('member_activity').insert({
          member_id: referrerMember?.id || null,
          phone_number: referrer.phoneNumber,
          remaining_points: totalReferralPoints,
          referral_points: totalReferralPoints,
          referral_count: 1,
          accumulated_points: 0,
        });
      }

      console.log('[PointsService] Referrer activity updated:', {
        referrer: referrer.phoneNumber,
        points: totalReferralPoints,
      });
    } catch (error) {
      console.error('[PointsService] Error updating referrer activity:', error);
    }
  }, 0);
}

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
    console.log('[PointsService] Reversing points for order:', orderId);
    
    // 🚀 首先回收会员活动数据（累积金额、利润、订单次数）
    // 无论积分是否存在，都需要执行此操作
    // 🔧 修复：添加 phone_number 用于备用查询
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('actual_payment, currency, profit_ngn, profit_usdt, member_id, phone_number')
      .eq('id', orderId)
      .single();
    
    if (orderError) {
      console.error('[PointsService] Failed to fetch order data:', orderError);
    }
    
    if (orderData) {
      // 🔧 修复：使用双路径查询 member_activity（member_id + phone_number）
      let existingActivity: any = null;
      
      // 优先通过 member_id 查找
      if (orderData.member_id) {
        const { data } = await supabase
          .from('member_activity')
          .select('*')
          .eq('member_id', orderData.member_id)
          .maybeSingle();
        existingActivity = data;
      }
      
      // 如果 member_id 查询失败，通过 phone_number 查找
      if (!existingActivity && orderData.phone_number) {
        const { data } = await supabase
          .from('member_activity')
          .select('*')
          .eq('phone_number', orderData.phone_number)
          .maybeSingle();
        existingActivity = data;
        if (existingActivity) {
          console.log('[PointsService] Found activity via phone_number fallback:', orderData.phone_number);
        }
      }
      
      if (existingActivity) {
        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        
        // 回收累积金额
        const currency = orderData.currency;
        const actualPayment = orderData.actual_payment || 0;
        if (currency === 'NGN') {
          updateData.total_accumulated_ngn = Math.max(0, (existingActivity.total_accumulated_ngn || 0) - actualPayment);
        } else if (currency === 'GHS') {
          updateData.total_accumulated_ghs = Math.max(0, (existingActivity.total_accumulated_ghs || 0) - actualPayment);
        } else if (currency === 'USDT') {
          updateData.total_accumulated_usdt = Math.max(0, (existingActivity.total_accumulated_usdt || 0) - actualPayment);
        }
        
        // 回收累积利润
        const profit = currency === 'USDT' ? (orderData.profit_usdt || 0) : (orderData.profit_ngn || 0);
        updateData.accumulated_profit = Math.max(0, (existingActivity.accumulated_profit || 0) - profit);
        
        // 回收订单次数
        updateData.order_count = Math.max(0, (existingActivity.order_count || 0) - 1);
        
        const { error: activityUpdateError } = await supabase
          .from('member_activity')
          .update(updateData)
          .eq('id', existingActivity.id);
        
        if (activityUpdateError) {
          console.error('[PointsService] Failed to reverse activity data:', activityUpdateError);
        } else {
          console.log('[PointsService] Reversed activity data:', {
            memberId: orderData.member_id,
            phoneNumber: orderData.phone_number,
            reversedAmount: actualPayment,
            reversedCurrency: currency,
            reversedProfit: profit,
            newOrderCount: updateData.order_count,
          });
        }
      } else {
        console.warn('[PointsService] No activity record found for order:', {
          orderId,
          memberId: orderData.member_id,
          phoneNumber: orderData.phone_number,
        });
      }
    }
    
    // 查找该订单的所有已发放积分记录（正积分，状态为issued）
    const { data: issuedEntries, error: fetchError } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'issued')
      .gt('points_earned', 0); // 只查找正积分记录

    if (fetchError) throw fetchError;
    
    if (!issuedEntries || issuedEntries.length === 0) {
      console.warn(`[PointsService] No issued positive points entries found for order ${orderId}`);
      return true; // 没有需要回收的积分，但活动数据已回收，视为成功
    }

    console.log(`[PointsService] Found ${issuedEntries.length} entries to reverse`);

    // ⚠️ 强制规则：原始正积分记录保持 'issued' 状态不变
    // 只新增负积分流水来记录回收

    // ============= 为每条正积分记录创建对应的负积分流水 =============
    // 强制规则：
    // - 正积分永远是已发放（status='issued'，points_earned > 0）
    // - 回收只能通过负积分体现（status='reversed'，points_earned < 0）
    for (const entry of issuedEntries) {
      const negativePoints = -(entry.points_earned || 0);
      
      if (negativePoints >= 0) continue; // 跳过无效记录
      
      const reversalEntry = {
        member_code: entry.member_code,
        phone_number: entry.phone_number,
        order_id: orderId, // 关联同一个 order_id
        transaction_type: entry.transaction_type,
        actual_payment: entry.actual_payment,
        currency: entry.currency,
        exchange_rate: entry.exchange_rate,
        usd_amount: entry.usd_amount,
        points_multiplier: entry.points_multiplier,
        points_earned: negativePoints, // 负积分
        status: 'reversed', // 状态 = 已回收
        creator_id: entry.creator_id,
      };

      const { error: insertError } = await supabase
        .from('points_ledger')
        .insert(reversalEntry);

      if (insertError) {
        // ⚠️ 增强错误处理：插入失败时必须抛出异常，不能静默继续
        console.error('[PointsService] CRITICAL: Failed to insert reversal entry:', insertError);
        console.error('[PointsService] Reversal data:', reversalEntry);
        throw new Error(`积分回收失败: ${insertError.message || '数据库插入错误'}`);
      }
      
      console.log('[PointsService] Created reversal entry:', {
        memberCode: entry.member_code,
        type: entry.transaction_type,
        originalPoints: entry.points_earned,
        negativePoints,
      });

      const typeLabel = {
        'consumption': '消费积分',
        'referral_1': '推荐积分1',
        'referral_2': '推荐积分2',
      }[entry.transaction_type] || '积分';

      logOperation(
        'activity_gift',
        'create',
        orderId,
        null,
        reversalEntry,
        `会员 ${entry.member_code} ${typeLabel}回收 ${negativePoints}`
      );
    }

    // ============= 第二步：扣减消费者的 remaining_points 和 accumulated_points =============
    const consumptionEntries = issuedEntries.filter(e => e.transaction_type === 'consumption');
    
    for (const entry of consumptionEntries) {
      const pointsToDeduct = entry.points_earned || 0;
      if (pointsToDeduct <= 0) continue;

      console.log('[PointsService] Deducting consumer remaining_points:', {
        phone: entry.phone_number,
        pointsToDeduct,
      });

      const { data: existingActivity, error: activityFetchError } = await supabase
        .from('member_activity')
        .select('id, remaining_points, accumulated_points')
        .eq('phone_number', entry.phone_number)
        .maybeSingle();

      if (activityFetchError) {
        console.error('[PointsService] Failed to fetch consumer activity:', activityFetchError);
      } else if (existingActivity) {
        const newRemainingPoints = Math.max(0, (existingActivity.remaining_points || 0) - pointsToDeduct);
        const newAccumulatedPoints = Math.max(0, (existingActivity.accumulated_points || 0) - pointsToDeduct);

        const { error: updateActivityError } = await supabase
          .from('member_activity')
          .update({
            remaining_points: newRemainingPoints,
            accumulated_points: newAccumulatedPoints,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingActivity.id);

        if (updateActivityError) {
          console.error('[PointsService] Failed to deduct consumer remaining_points:', updateActivityError);
        } else {
          console.log('[PointsService] Consumer remaining_points deducted:', {
            oldRemainingPoints: existingActivity.remaining_points,
            newRemainingPoints,
            deductedPoints: pointsToDeduct,
          });
        }
      }
    }

    // ============= 第三步：扣减推荐人的 remaining_points 和 referral_points =============
    const referralEntries = issuedEntries.filter(
      e => e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2'
    );
    
    // 按推荐人分组统计需要扣减的积分
    const referrerPointsMap = new Map<string, number>();
    for (const entry of referralEntries) {
      const phone = entry.phone_number;
      if (phone) {
        const current = referrerPointsMap.get(phone) || 0;
        referrerPointsMap.set(phone, current + (entry.points_earned || 0));
      }
    }

    for (const [referrerPhone, pointsToDeduct] of referrerPointsMap) {
      if (pointsToDeduct <= 0) continue;

      console.log('[PointsService] Deducting referrer remaining_points:', {
        referrerPhone,
        pointsToDeduct,
      });

      const { data: existingActivity, error: activityFetchError } = await supabase
        .from('member_activity')
        .select('id, remaining_points, referral_points, referral_count')
        .eq('phone_number', referrerPhone)
        .maybeSingle();

      if (activityFetchError) {
        console.error('[PointsService] Failed to fetch referrer activity for reversal:', activityFetchError);
      } else if (existingActivity) {
        const newRemainingPoints = Math.max(0, (existingActivity.remaining_points || 0) - pointsToDeduct);
        const newReferralPoints = Math.max(0, (existingActivity.referral_points || 0) - pointsToDeduct);
        const newReferralCount = Math.max(0, (existingActivity.referral_count || 0) - 1);

        const { error: updateActivityError } = await supabase
          .from('member_activity')
          .update({
            remaining_points: newRemainingPoints,
            referral_points: newReferralPoints,
            referral_count: newReferralCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingActivity.id);

        if (updateActivityError) {
          console.error('[PointsService] Failed to deduct referrer remaining_points:', updateActivityError);
        } else {
          console.log('[PointsService] Referrer remaining_points deducted:', {
            oldRemainingPoints: existingActivity.remaining_points,
            newRemainingPoints,
            deductedPoints: pointsToDeduct,
          });
        }
      }
    }

    // 活动数据回收已在函数开头执行，此处不再重复

    console.log('[PointsService] Points reversal completed for order:', orderId);
    return true;
  } catch (error) {
    console.error('[PointsService] Failed to reverse points:', error);
    return false;
  }
}

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
  console.log('[PointsService] Restoring points for order:', params.orderId);
  
  const result: CreatePointsResult = {
    consumptionPoints: 0,
    referral1Points: 0,
    referral2Points: 0,
    success: false,
  };

  try {
    // 第一步：查找所有该订单的回收记录（负积分，status='reversed'）
    const { data: reversedEntries, error: reversedError } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('order_id', params.orderId)
      .eq('status', 'reversed')
      .lt('points_earned', 0);

    if (reversedError) {
      console.error('[PointsService] Error fetching reversed entries:', reversedError);
      throw reversedError;
    }

    // 如果有回收记录，删除它们并恢复对应的 member_activity
    if (reversedEntries && reversedEntries.length > 0) {
      console.log(`[PointsService] Found ${reversedEntries.length} reversed entries to restore for order ${params.orderId}`);
      
      // 删除所有回收记录
      const { error: deleteError } = await supabase
        .from('points_ledger')
        .delete()
        .eq('order_id', params.orderId)
        .eq('status', 'reversed')
        .lt('points_earned', 0);

      if (deleteError) {
        console.error('[PointsService] Error deleting reversal entries:', deleteError);
        throw deleteError;
      }

      console.log(`[PointsService] Deleted ${reversedEntries.length} reversal entries`);

      // 按电话号码分组统计需要恢复的积分
      const phonePointsMap = new Map<string, { 
        consumption: number; 
        referral: number; 
        memberCode: string;
      }>();

      for (const entry of reversedEntries) {
        const phone = entry.phone_number;
        if (!phone) continue;

        const current = phonePointsMap.get(phone) || { consumption: 0, referral: 0, memberCode: entry.member_code || '' };
        const pointsToRestore = Math.abs(entry.points_earned || 0);

        if (entry.transaction_type === 'consumption') {
          current.consumption += pointsToRestore;
          result.consumptionPoints += pointsToRestore;
        } else if (entry.transaction_type === 'referral_1' || entry.transaction_type === 'referral_2') {
          current.referral += pointsToRestore;
          if (entry.transaction_type === 'referral_1') {
            result.referral1Points += pointsToRestore;
          } else {
            result.referral2Points += pointsToRestore;
          }
        }

        phonePointsMap.set(phone, current);
      }

      // 恢复每个相关会员的积分
      for (const [phone, points] of phonePointsMap) {
        console.log(`[PointsService] Restoring points for phone ${phone}:`, points);

        const { data: activity, error: activityError } = await supabase
          .from('member_activity')
          .select('id, remaining_points, accumulated_points, referral_points')
          .eq('phone_number', phone)
          .maybeSingle();

        if (activityError) {
          console.error(`[PointsService] Error fetching activity for ${phone}:`, activityError);
          continue;
        }

        if (activity) {
          const updates: Record<string, any> = {
            updated_at: new Date().toISOString(),
          };

          if (points.consumption > 0) {
            updates.remaining_points = (activity.remaining_points || 0) + points.consumption;
            updates.accumulated_points = (activity.accumulated_points || 0) + points.consumption;
          }

          if (points.referral > 0) {
            updates.remaining_points = (updates.remaining_points ?? activity.remaining_points ?? 0) + points.referral;
            updates.referral_points = (activity.referral_points || 0) + points.referral;
          }

          const { error: updateError } = await supabase
            .from('member_activity')
            .update(updates)
            .eq('id', activity.id);

          if (updateError) {
            console.error(`[PointsService] Error updating activity for ${phone}:`, updateError);
          } else {
            console.log(`[PointsService] Restored points for ${phone}:`, {
              consumption: points.consumption,
              referral: points.referral,
              newRemainingPoints: updates.remaining_points,
            });
          }
        }
      }

      result.success = true;
      console.log('[PointsService] Points restoration completed:', result);
      return result;
    }

    // 第二步：检查是否已有正积分记录（说明从未被取消过，或已经恢复过）
    const { data: existingIssuedEntries, error: checkError } = await supabase
      .from('points_ledger')
      .select('id, transaction_type, points_earned')
      .eq('order_id', params.orderId)
      .eq('status', 'issued')
      .gt('points_earned', 0);

    if (checkError) {
      console.error('[PointsService] Error checking existing points:', checkError);
      throw checkError;
    }

    if (existingIssuedEntries && existingIssuedEntries.length > 0) {
      // 已有正积分且无回收记录，说明积分状态正常，无需操作
      console.log(`[PointsService] Order ${params.orderId} already has valid issued entries, no restoration needed`);
      for (const entry of existingIssuedEntries) {
        if (entry.transaction_type === 'consumption') {
          result.consumptionPoints = entry.points_earned || 0;
        } else if (entry.transaction_type === 'referral_1') {
          result.referral1Points = entry.points_earned || 0;
        } else if (entry.transaction_type === 'referral_2') {
          result.referral2Points = entry.points_earned || 0;
        }
      }
      result.success = true;
      return result;
    }

    // 第三步：如果既没有回收记录也没有正积分记录，则创建新的积分记录
    console.log('[PointsService] No existing points found for order, creating new entries');
    return createPointsOnOrderCreate(params);
  } catch (error) {
    console.error('[PointsService] Failed to restore points:', error);
    return result;
  }
}

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

  console.warn('[PointsService] ===== adjustPointsOnOrderEdit CALLED =====', {
    orderId, memberCode, phoneNumber,
    rawNewActualPayment: params.newActualPayment,
    parsedNewActualPayment: newActualPayment,
    rawOldActualPayment: params.oldActualPayment,
    newCurrency,
    oldCurrency: params.oldCurrency,
    typeOfNewPayment: typeof params.newActualPayment,
  });

  try {
    // 1. 查询该订单所有消费积分的净值
    const { data: existingEntries, error: fetchError } = await supabase
      .from('points_ledger')
      .select('points_earned, status')
      .eq('order_id', orderId)
      .eq('transaction_type', 'consumption');

    if (fetchError) throw fetchError;

    const currentNetPoints = (existingEntries || []).reduce(
      (sum, e) => sum + (e.points_earned || 0), 0
    );

    // 2. 重新计算应得积分
    const DEFAULT_SETTINGS: PointsSettings = {
      mode: 'auto', ngnToUsdRate: 1580, ghsToUsdRate: 15.5, usdToPointsRate: 1,
      ngnFormulaMultiplier: 1, ghsFormulaMultiplier: 1, usdtFormulaMultiplier: 1,
      usdtCoefficient: 1, lastAutoUpdate: '', lastManualUpdate: '',
      lastFetchedNgnRate: 1580, lastFetchedGhsRate: 15.5,
      referralPointsPerAction: 1, consumptionPointsPerAction: 1,
      referralMode1Enabled: true, referralMode: 'mode1',
      referralMode2Percentage: 10, referralMode2Enabled: false,
      referralActivityEnabled: true,
    };

    const { data: settingsData } = await supabase
      .from('shared_data_store')
      .select('data_value')
      .eq('data_key', 'points_settings')
      .single();

    const settings: PointsSettings = settingsData?.data_value
      ? { ...DEFAULT_SETTINGS, ...(settingsData.data_value as Partial<PointsSettings>) }
      : DEFAULT_SETTINGS;

    const exchangeRate = getExchangeRate(newCurrency, settings);
    const usdAmount = newActualPayment / exchangeRate;
    const pointsMultiplier = settings.usdToPointsRate || 1;
    const newPoints = newActualPayment > 0 ? Math.floor(usdAmount * pointsMultiplier) : 0;

    // 3. 计算差额
    const delta = newPoints - currentNetPoints;

    console.warn('[PointsService] adjustPointsOnOrderEdit CALCULATION:', {
      orderId, memberCode, currentNetPoints, newPoints, delta,
      oldPayment: params.oldActualPayment, newPayment: newActualPayment,
      exchangeRate, usdAmount, pointsMultiplier,
      existingEntriesCount: (existingEntries || []).length,
    });

    if (delta === 0) {
      console.log('[PointsService] Delta is 0, no adjustment needed');
      // 更新 order_points 以确保一致
      await supabase.from('orders').update({ order_points: newPoints }).eq('id', orderId);
      return { delta: 0, success: true };
    }

    // 4. 插入差额积分记录
    const adjustmentEntry = {
      member_code: memberCode,
      phone_number: phoneNumber,
      order_id: orderId,
      transaction_type: 'consumption',
      actual_payment: newActualPayment,
      currency: newCurrency,
      exchange_rate: exchangeRate,
      usd_amount: usdAmount,
      points_multiplier: pointsMultiplier,
      points_earned: delta,
      status: delta > 0 ? 'issued' : 'reversed',
      creator_id: creatorId || null,
    };

    const { error: insertError } = await supabase
      .from('points_ledger')
      .insert(adjustmentEntry);

    if (insertError) {
      console.error('[PointsService] Failed to insert points adjustment:', insertError);
      throw insertError;
    }

    // 5. 更新 orders.order_points
    await supabase.from('orders').update({ order_points: newPoints }).eq('id', orderId);

    // 6. 更新 member_activity 的 remaining_points / accumulated_points
    const { data: activity } = await supabase
      .from('member_activity')
      .select('id, remaining_points, accumulated_points')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (activity) {
      await supabase
        .from('member_activity')
        .update({
          remaining_points: (activity.remaining_points || 0) + delta,
          accumulated_points: (activity.accumulated_points || 0) + delta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activity.id);
    }

    // 7. 操作日志
    const actionDesc = delta > 0
      ? `订单修改补发积分: ${memberCode} +${delta}积分 (订单${orderId})`
      : `订单修改扣减积分: ${memberCode} ${delta}积分 (订单${orderId})`;
    
    logOperation('activity_gift', 'update', orderId, 
      { oldPoints: currentNetPoints, oldPayment: params.oldActualPayment, oldCurrency: params.oldCurrency },
      { newPoints, newPayment: newActualPayment, newCurrency, delta },
      actionDesc
    );

    console.warn('[PointsService] ===== Points adjustment COMPLETED =====', { delta, newPoints, currentNetPoints });
    return { delta, success: true };
  } catch (error) {
    console.error('[PointsService] adjustPointsOnOrderEdit FAILED:', error);
    return { delta: 0, success: false };
  }
}

// ============= 查询函数 =============

/**
 * 获取会员积分余额
 * 规则：累加所有积分流水（正积分发放 + 负积分回收）
 * 正积分永远是已发放，负积分代表回收
 */
export async function getMemberPointsBalance(memberCode: string, lastResetTime?: string | null): Promise<number> {
  try {
    let query = supabase
      .from('points_ledger')
      .select('points_earned')
      .eq('member_code', memberCode);

    if (lastResetTime) {
      query = query.gte('created_at', lastResetTime);
    }

    const { data, error } = await query;

    if (error) throw error;

    // 累加所有积分（正负都算），负积分自动抵消正积分
    const total = (data || []).reduce((sum, e) => sum + (e.points_earned || 0), 0);
    return Math.max(0, total);
  } catch (error) {
    console.error('[PointsService] Failed to calculate member points:', error);
    return 0;
  }
}

/**
 * 检查订单是否已发放积分
 */
export async function hasOrderEarnedPoints(orderId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'issued')
      .limit(1);

    if (error) throw error;
    return (data || []).length > 0;
  } catch (error) {
    console.error('[PointsService] Failed to check order points:', error);
    return false;
  }
}

/**
 * 获取订单相关的积分明细
 */
export async function getOrderPointsEntries(orderId: string): Promise<PointsEntry[]> {
  try {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as PointsEntry[];
  } catch (error) {
    console.error('[PointsService] Failed to get order points entries:', error);
    return [];
  }
}

/**
 * 获取会员的积分明细
 */
export async function getMemberPointsEntries(memberCode: string): Promise<PointsEntry[]> {
  try {
    const { data, error } = await supabase
      .from('points_ledger')
      .select('*')
      .eq('member_code', memberCode)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as PointsEntry[];
  } catch (error) {
    console.error('[PointsService] Failed to get member points entries:', error);
    return [];
  }
}

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
