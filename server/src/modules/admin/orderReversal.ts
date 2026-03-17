/**
 * 订单删除时的活动数据回滚
 * 与前端 pointsService.reversePointsOnOrderCancel 逻辑一致
 */
import { supabaseAdmin } from '../../database/index.js';

interface GiftRow {
  id: string;
  phone_number?: string;
  member_id?: string;
  currency?: string;
  amount?: number;
}

interface OrderRow {
  id: string;
  actual_payment?: number;
  currency?: string;
  profit_ngn?: number;
  profit_usdt?: number;
  member_id?: string;
  phone_number?: string;
}

/**
 * 为单个订单执行活动数据回滚（member_activity 累积字段 + points_ledger 负积分）
 */
export async function reverseActivityDataForOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('actual_payment, currency, profit_ngn, profit_usdt, member_id, phone_number')
      .eq('id', orderId)
      .single();

    if (orderError || !orderData) {
      return { ok: false, error: orderError?.message ?? 'Order not found' };
    }

    const order = orderData as OrderRow;
    order.id = orderId;

    // 1. 回滚 member_activity 累积字段
    let existingActivity: { id: string; total_accumulated_ngn?: number; total_accumulated_ghs?: number; total_accumulated_usdt?: number; accumulated_profit?: number; order_count?: number } | null = null;

    if (order.member_id) {
      const { data } = await supabaseAdmin
        .from('member_activity')
        .select('id, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, accumulated_profit, order_count')
        .eq('member_id', order.member_id)
        .maybeSingle();
      existingActivity = data;
    }
    if (!existingActivity && order.phone_number) {
      const { data } = await supabaseAdmin
        .from('member_activity')
        .select('id, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, accumulated_profit, order_count')
        .eq('phone_number', order.phone_number)
        .maybeSingle();
      existingActivity = data;
    }

    if (existingActivity) {
      const currency = order.currency || 'NGN';
      const actualPayment = Number(order.actual_payment) || 0;
      const profit = currency === 'USDT' ? (Number(order.profit_usdt) || 0) : (Number(order.profit_ngn) || 0);

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        order_count: Math.max(0, (existingActivity.order_count || 0) - 1),
        accumulated_profit: Math.max(0, (existingActivity.accumulated_profit || 0) - profit),
      };
      if (currency === 'NGN' || currency === '奈拉') {
        updateData.total_accumulated_ngn = Math.max(0, (existingActivity.total_accumulated_ngn || 0) - actualPayment);
      } else if (currency === 'GHS' || currency === '赛地') {
        updateData.total_accumulated_ghs = Math.max(0, (existingActivity.total_accumulated_ghs || 0) - actualPayment);
      } else if (currency === 'USDT') {
        updateData.total_accumulated_usdt = Math.max(0, (existingActivity.total_accumulated_usdt || 0) - actualPayment);
      }

      const { error: activityError } = await supabaseAdmin
        .from('member_activity')
        .update(updateData)
        .eq('id', existingActivity.id);
      if (activityError) return { ok: false, error: `member_activity: ${activityError.message}` };
    }

    // 2. 查找已发放积分，插入负积分流水
    const { data: issuedEntries, error: fetchError } = await supabaseAdmin
      .from('points_ledger')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'issued')
      .gt('points_earned', 0);

    if (fetchError) return { ok: false, error: `points_ledger fetch: ${fetchError.message}` };

    const entries = issuedEntries || [];
    for (const entry of entries) {
      const negativePoints = -(entry.points_earned || 0);
      if (negativePoints >= 0) continue;

      const reversalEntry = {
        member_code: entry.member_code,
        phone_number: entry.phone_number,
        order_id: orderId,
        transaction_type: entry.transaction_type,
        actual_payment: entry.actual_payment,
        currency: entry.currency,
        exchange_rate: entry.exchange_rate,
        usd_amount: entry.usd_amount,
        points_multiplier: entry.points_multiplier,
        points_earned: negativePoints,
        status: 'reversed',
        creator_id: entry.creator_id,
      };

      const { error: insertError } = await supabaseAdmin.from('points_ledger').insert(reversalEntry);
      if (insertError) return { ok: false, error: `points_ledger insert: ${insertError.message}` };
    }

    // 3. 扣减消费者 remaining_points / accumulated_points
    const consumptionEntries = entries.filter((e: { transaction_type: string }) => e.transaction_type === 'consumption');
    for (const entry of consumptionEntries) {
      const pointsToDeduct = entry.points_earned || 0;
      if (pointsToDeduct <= 0) continue;

      const { data: act } = await supabaseAdmin
        .from('member_activity')
        .select('id, remaining_points, accumulated_points')
        .eq('phone_number', entry.phone_number)
        .maybeSingle();

      if (act) {
        const newRemaining = Math.max(0, (act.remaining_points || 0) - pointsToDeduct);
        const newAccumulated = Math.max(0, (act.accumulated_points || 0) - pointsToDeduct);
        await supabaseAdmin
          .from('member_activity')
          .update({ remaining_points: newRemaining, accumulated_points: newAccumulated, updated_at: new Date().toISOString() })
          .eq('id', act.id);
      }
    }

    // 4. 扣减推荐人 remaining_points / referral_points / referral_count
    const referralEntries = entries.filter(
      (e: { transaction_type: string }) => e.transaction_type === 'referral_1' || e.transaction_type === 'referral_2'
    );
    const referrerMap = new Map<string, number>();
    for (const e of referralEntries) {
      const phone = e.phone_number;
      if (phone) referrerMap.set(phone, (referrerMap.get(phone) || 0) + (e.points_earned || 0));
    }
    for (const [phone, pointsToDeduct] of referrerMap) {
      if (pointsToDeduct <= 0) continue;
      const { data: act } = await supabaseAdmin
        .from('member_activity')
        .select('id, remaining_points, referral_points, referral_count')
        .eq('phone_number', phone)
        .maybeSingle();
      if (act) {
        const newRemaining = Math.max(0, (act.remaining_points || 0) - pointsToDeduct);
        const newReferral = Math.max(0, (act.referral_points || 0) - pointsToDeduct);
        const newCount = Math.max(0, (act.referral_count || 0) - 1);
        await supabaseAdmin
          .from('member_activity')
          .update({ remaining_points: newRemaining, referral_points: newReferral, referral_count: newCount, updated_at: new Date().toISOString() })
          .eq('id', act.id);
      }
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * 为一批订单执行活动数据回滚
 */
export async function reverseActivityDataForOrderBatch(
  orderIds: string[]
): Promise<{ reversed: number; errors: string[] }> {
  const errors: string[] = [];
  let reversed = 0;
  for (const id of orderIds) {
    const result = await reverseActivityDataForOrder(id);
    if (result.ok) reversed++;
    else errors.push(`order ${id}: ${result.error}`);
  }
  return { reversed, errors };
}

/**
 * 批量删除 activity_gifts 前，回滚 member_activity 的 total_gift_* 字段
 */
export async function reverseGiftActivityDataBeforeDelete(
  giftIds: string[]
): Promise<{ success: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;

  if (giftIds.length === 0) return { success: 0, errors: [] };

  const { data: gifts, error: fetchErr } = await supabaseAdmin
    .from('activity_gifts')
    .select('id, phone_number, member_id, currency, amount')
    .in('id', giftIds);

  if (fetchErr) throw fetchErr;
  const rows = (gifts || []) as GiftRow[];

  for (const g of rows) {
    const amount = Number(g.amount) || 0;
    if (amount <= 0) continue;

    const currency = g.currency || 'NGN';
    let act: { id: string; total_gift_ngn?: number; total_gift_ghs?: number; total_gift_usdt?: number } | null = null;

    if (g.member_id) {
      const { data } = await supabaseAdmin
        .from('member_activity')
        .select('id, total_gift_ngn, total_gift_ghs, total_gift_usdt')
        .eq('member_id', g.member_id)
        .maybeSingle();
      act = data;
    } else if (g.phone_number) {
      const { data } = await supabaseAdmin
        .from('member_activity')
        .select('id, total_gift_ngn, total_gift_ghs, total_gift_usdt')
        .eq('phone_number', g.phone_number)
        .maybeSingle();
      act = data;
    }

    if (!act) continue;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (currency === 'NGN' || currency === '奈拉') {
      updateData.total_gift_ngn = Math.max(0, (act.total_gift_ngn || 0) - amount);
    } else if (currency === 'GHS' || currency === '赛地') {
      updateData.total_gift_ghs = Math.max(0, (act.total_gift_ghs || 0) - amount);
    } else if (currency === 'USDT') {
      updateData.total_gift_usdt = Math.max(0, (act.total_gift_usdt || 0) - amount);
    }

    const { error: updErr } = await supabaseAdmin
      .from('member_activity')
      .update(updateData)
      .eq('id', act.id);
    if (updErr) errors.push(`gift ${g.id}: ${updErr.message}`);
    else success++;
  }
  return { success, errors };
}
