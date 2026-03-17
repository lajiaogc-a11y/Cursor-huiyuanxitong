/**
 * Admin Repository - 数据管理/归档
 * 将 DataManagementTab 的删除逻辑迁移至 Backend
 */
import { supabaseAdmin } from '../../database/index.js';
import type { BulkDeleteSelections } from './types.js';
import { reverseActivityDataForOrder, reverseActivityDataForOrderBatch, reverseGiftActivityDataBeforeDelete } from './orderReversal.js';

const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 500;
const FETCH_BATCH = 1000;

export async function verifyAdminPasswordRepository(
  username: string,
  password: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('verify_employee_login', {
    p_username: username,
    p_password: password,
  });
  if (error || !data || data.length === 0) return false;
  const row = data[0] as { status?: string };
  return row?.status === 'active';
}

export async function bulkDeleteRepository(
  params: {
    retainMonths: number;
    deleteSelections: BulkDeleteSelections;
    tenantId?: string | null;
  }
): Promise<{ deletedSummary: { table: string; count: number }[]; errors: string[] }> {
  const { retainMonths, deleteSelections, tenantId } = params;
  const errors: string[] = [];
  const deletedSummary: { table: string; count: number }[] = [];

  const deleteAll = retainMonths === 0;
  const cutoffDate = new Date();
  if (!deleteAll) cutoffDate.setMonth(cutoffDate.getMonth() - retainMonths);
  const cutoffDateStr = cutoffDate.toISOString();

  const members = deleteSelections.members ?? { memberManagement: false, activityData: false, activityGift: false, pointsLedger: false };
  const shiftData = deleteSelections.shiftData ?? { shiftHandovers: false, shiftReceivers: false };
  const merchantSettlement = deleteSelections.merchantSettlement ?? { balanceChangeLogs: false, initialBalances: false };
  const knowledgeData = deleteSelections.knowledgeData ?? { categories: false, articles: false };
  const preserveActivityData = deleteSelections.preserveActivityData ?? true;

  // 收集订单 ID
  let orderIdsToDelete: string[] = [];
  if (deleteSelections.orders) {
    let offset = 0;
    while (true) {
      let q = supabaseAdmin.from('orders').select('id');
      if (deleteAll) q = q.neq('id', NULL_UUID);
      else q = q.lt('created_at', cutoffDateStr);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data: batch } = await q.range(offset, offset + FETCH_BATCH - 1);
      if (!batch || batch.length === 0) break;
      orderIdsToDelete = orderIdsToDelete.concat(batch.map((o: { id: string }) => o.id));
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
  }

  // 收集会员 ID 和 member_code
  let memberIdsToDelete: string[] = [];
  let memberCodesToDelete: string[] = [];
  if (members.memberManagement) {
    let offset = 0;
    while (true) {
      let q = supabaseAdmin.from('members').select('id, member_code');
      if (deleteAll) q = q.neq('id', NULL_UUID);
      else q = q.lt('created_at', cutoffDateStr);
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data: batch } = await q.range(offset, offset + FETCH_BATCH - 1);
      if (!batch || batch.length === 0) break;
      memberIdsToDelete = memberIdsToDelete.concat(batch.map((m: { id: string }) => m.id));
      memberCodesToDelete = memberCodesToDelete.concat(
        batch.map((m: { member_code?: string }) => m.member_code).filter(Boolean) as string[]
      );
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
  }

  // 0. 订单删除前：回收活动数据（member_activity + points_ledger 负积分）
  if (orderIdsToDelete.length > 0 && deleteSelections.recycleActivityDataOnOrderDelete) {
    const { reversed, errors: revErrors } = await reverseActivityDataForOrderBatch(orderIdsToDelete);
    errors.push(...revErrors);
    if (revErrors.length > 0) {
      console.warn('[bulkDelete] Order reversal had errors:', revErrors);
    } else if (reversed > 0) {
      console.log('[bulkDelete] Reversed activity data for', reversed, 'orders');
    }
  }

  // 1. points_ledger - 订单关联
  if (orderIdsToDelete.length > 0) {
    for (let i = 0; i < orderIdsToDelete.length; i += BATCH_SIZE) {
      const batch = orderIdsToDelete.slice(i, i + BATCH_SIZE);
      if (members.pointsLedger) {
        const { error } = await supabaseAdmin.from('points_ledger').delete().in('order_id', batch);
        if (error) errors.push(`points_ledger(order) batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        const { error } = await supabaseAdmin.from('points_ledger').update({ order_id: null }).in('order_id', batch);
        if (error) errors.push(`points_ledger unlink(order) batch: ${error.message}`);
      }
    }
  }

  // 2. points_ledger - 会员关联
  if (memberIdsToDelete.length > 0) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      if (members.pointsLedger) {
        const { error } = await supabaseAdmin.from('points_ledger').delete().in('member_id', batch);
        if (error) errors.push(`points_ledger(member) batch: ${error.message}`);
      } else {
        const { error } = await supabaseAdmin.from('points_ledger').update({ member_id: null }).in('member_id', batch);
        if (error) errors.push(`points_ledger unlink(member) batch: ${error.message}`);
      }
    }
  }

  // 3. points_ledger 独立删除
  if (members.pointsLedger && orderIdsToDelete.length === 0 && memberIdsToDelete.length === 0) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('points_ledger').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('points_ledger').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('points_ledger').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('points_ledger').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`points_ledger: ${error.message}`);
    else if (count) deletedSummary.push({ table: '积分明细', count });
  }

  // 4. activity_gifts（删除前回滚 member_activity 的 total_gift_*）
  if (members.activityGift) {
    let giftIdsToDelete: string[] = [];
    let offset = 0;
    while (true) {
      let q = supabaseAdmin.from('activity_gifts').select('id');
      if (deleteAll) q = q.neq('id', NULL_UUID);
      else q = q.lt('created_at', cutoffDateStr);
      const { data: batch } = await q.range(offset, offset + FETCH_BATCH - 1);
      if (!batch || batch.length === 0) break;
      giftIdsToDelete = giftIdsToDelete.concat(batch.map((g: { id: string }) => g.id));
      if (batch.length < FETCH_BATCH) break;
      offset += FETCH_BATCH;
    }
    if (giftIdsToDelete.length > 0) {
      try {
        const { errors: revErrors } = await reverseGiftActivityDataBeforeDelete(giftIdsToDelete);
        errors.push(...revErrors);
      } catch (e) {
        errors.push(`activity_gifts reversal: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const { count } = deleteAll
      ? await supabaseAdmin.from('activity_gifts').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('activity_gifts').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('activity_gifts').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('activity_gifts').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`activity_gifts: ${error.message}`);
    else if (count) deletedSummary.push({ table: '活动赠送', count });
  } else if (memberIdsToDelete.length > 0) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('activity_gifts').update({ member_id: null }).in('member_id', batch);
      if (error) errors.push(`activity_gifts unlink: ${error.message}`);
    }
  }

  // 5. member_activity
  if (memberIdsToDelete.length > 0) {
    if (!preserveActivityData) {
      let deletedCount = 0;
      for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
        const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin.from('member_activity').delete().in('member_id', batch);
        if (error) errors.push(`member_activity: ${error.message}`);
        else deletedCount += batch.length;
      }
      if (deletedCount > 0) deletedSummary.push({ table: '会员活动', count: deletedCount });
    } else {
      for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
        const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin.from('member_activity').update({ member_id: null }).in('member_id', batch);
        if (error) errors.push(`member_activity unlink: ${error.message}`);
      }
    }
  } else if (members.activityData && !preserveActivityData && deleteAll) {
    const { count } = await supabaseAdmin.from('member_activity').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID);
    const { error } = await supabaseAdmin.from('member_activity').delete().neq('id', NULL_UUID);
    if (error) errors.push(`member_activity: ${error.message}`);
    else if (count) deletedSummary.push({ table: '会员活动', count });
  }

  // 6. points_accounts
  if (memberCodesToDelete.length > 0 && !preserveActivityData) {
    for (let i = 0; i < memberCodesToDelete.length; i += BATCH_SIZE) {
      const batch = memberCodesToDelete.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('points_accounts').delete().in('member_code', batch);
      if (error) errors.push(`points_accounts: ${error.message}`);
    }
  } else if (members.activityData && !preserveActivityData && deleteAll) {
    const { count } = await supabaseAdmin.from('points_accounts').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID);
    const { error } = await supabaseAdmin.from('points_accounts').delete().neq('id', NULL_UUID);
    if (error) errors.push(`points_accounts: ${error.message}`);
    else if (count) deletedSummary.push({ table: '积分账户', count });
  }

  // 7. 解绑 orders.member_id
  if (memberIdsToDelete.length > 0 && !deleteSelections.orders) {
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin.from('orders').update({ member_id: null }).in('member_id', batch);
      if (error) errors.push(`orders unlink member: ${error.message}`);
    }
  }

  // 8. 删除订单（recycleActivityData 需前端 pointsService，后端暂不实现）
  if (orderIdsToDelete.length > 0) {
    let deletedCount = 0;
    for (let i = 0; i < orderIdsToDelete.length; i += BATCH_SIZE) {
      const batch = orderIdsToDelete.slice(i, i + BATCH_SIZE);
      let dq = supabaseAdmin.from('orders').delete().in('id', batch);
      if (tenantId) dq = dq.eq('tenant_id', tenantId);
      const { error } = await dq;
      if (error) errors.push(`orders batch: ${error.message}`);
      else deletedCount += batch.length;
    }
    if (deletedCount > 0) deletedSummary.push({ table: '订单', count: deletedCount });
  }

  // 9. referral_relations
  if (deleteSelections.referralRelations) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('referral_relations').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('referral_relations').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('referral_relations').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('referral_relations').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`referral_relations: ${error.message}`);
    else if (count) deletedSummary.push({ table: '推荐关系', count });
  }

  // 10. ledger_transactions + balance_change_logs
  if (merchantSettlement.balanceChangeLogs) {
    const { count: ledgerCount } = deleteAll
      ? await supabaseAdmin.from('ledger_transactions').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('ledger_transactions').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error: ledgerError } = deleteAll
      ? await supabaseAdmin.from('ledger_transactions').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('ledger_transactions').delete().lt('created_at', cutoffDateStr);
    if (ledgerError) errors.push(`ledger_transactions: ${ledgerError.message}`);
    else if (ledgerCount) deletedSummary.push({ table: '账本明细', count: ledgerCount });

    const { count } = deleteAll
      ? await supabaseAdmin.from('balance_change_logs').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('balance_change_logs').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('balance_change_logs').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('balance_change_logs').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`balance_change_logs: ${error.message}`);
    else if (count) deletedSummary.push({ table: '变动明细', count });
  }

  // 11. shared_data_store (initial balances) - 简化处理
  if (merchantSettlement.initialBalances) {
    const { data: balanceKeys } = await supabaseAdmin
      .from('shared_data_store')
      .select('id, data_key')
      .or('data_key.like.merchant_initial_balance_%,data_key.like.settlement_last_reset_%');
    if (balanceKeys && balanceKeys.length > 0) {
      const ids = balanceKeys.map((k: { id: string }) => k.id);
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin.from('shared_data_store').delete().in('id', batch);
        if (error) errors.push(`shared_data_store: ${error.message}`);
      }
      deletedSummary.push({ table: '初始余额', count: balanceKeys.length });
    }
  }

  // 12. 删除会员
  if (memberIdsToDelete.length > 0) {
    let deletedCount = 0;
    for (let i = 0; i < memberIdsToDelete.length; i += BATCH_SIZE) {
      const batch = memberIdsToDelete.slice(i, i + BATCH_SIZE);
      let dq = supabaseAdmin.from('members').delete().in('id', batch);
      if (tenantId) dq = dq.eq('tenant_id', tenantId);
      const { error } = await dq;
      if (error) errors.push(`members batch: ${error.message}`);
      else deletedCount += batch.length;
    }
    if (deletedCount > 0) deletedSummary.push({ table: '会员', count: deletedCount });
  }

  // 13. shift_handovers
  if (shiftData.shiftHandovers) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('shift_handovers').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('shift_handovers').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const res = deleteAll
      ? await supabaseAdmin.from('shift_handovers').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('shift_handovers').delete().lt('created_at', cutoffDateStr);
    const { error } = res as { error: { message: string } | null };
    if (error) errors.push(`shift_handovers: ${error.message}`);
    else if (count) deletedSummary.push({ table: '交班记录', count });
  }

  // 14. shift_receivers
  if (shiftData.shiftReceivers) {
    const { count } = await supabaseAdmin.from('shift_receivers').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID);
    const { error } = await supabaseAdmin.from('shift_receivers').delete().neq('id', NULL_UUID);
    if (error) errors.push(`shift_receivers: ${error.message}`);
    else if (count) deletedSummary.push({ table: '接班人列表', count });
  }

  // 15. audit_records
  if (deleteSelections.auditRecords) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('audit_records').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('audit_records').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('audit_records').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('audit_records').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`audit_records: ${error.message}`);
    else if (count) deletedSummary.push({ table: '审核记录', count });
  }

  // 16. operation_logs
  if (deleteSelections.operationLogs) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('operation_logs').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('operation_logs').select('*', { count: 'exact', head: true }).lt('timestamp', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('operation_logs').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('operation_logs').delete().lt('timestamp', cutoffDateStr);
    if (error) errors.push(`operation_logs: ${error.message}`);
    else if (count) deletedSummary.push({ table: '操作日志', count });
  }

  // 17. employee_login_logs
  if (deleteSelections.loginLogs) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('employee_login_logs').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('employee_login_logs').select('*', { count: 'exact', head: true }).lt('login_time', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('employee_login_logs').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('employee_login_logs').delete().lt('login_time', cutoffDateStr);
    if (error) errors.push(`employee_login_logs: ${error.message}`);
    else if (count) deletedSummary.push({ table: '登录日志', count });
  }

  // 18. knowledge_articles
  if (knowledgeData.articles) {
    const { count } = deleteAll
      ? await supabaseAdmin.from('knowledge_articles').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID)
      : await supabaseAdmin.from('knowledge_articles').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
    const { error } = deleteAll
      ? await supabaseAdmin.from('knowledge_articles').delete().neq('id', NULL_UUID)
      : await supabaseAdmin.from('knowledge_articles').delete().lt('created_at', cutoffDateStr);
    if (error) errors.push(`knowledge_articles: ${error.message}`);
    else if (count) deletedSummary.push({ table: '知识库文章', count });
  }

  // 19. knowledge_categories (after articles)
  if (knowledgeData.categories) {
    const { count } = await supabaseAdmin.from('knowledge_categories').select('*', { count: 'exact', head: true }).neq('id', NULL_UUID);
    const { error } = await supabaseAdmin.from('knowledge_categories').delete().neq('id', NULL_UUID);
    if (error) errors.push(`knowledge_categories: ${error.message}`);
    else if (count) deletedSummary.push({ table: '知识库分类', count });
  }

  return { deletedSummary, errors };
}

export async function deleteOrderByIdRepository(
  orderId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  // 删除前先回收活动数据（与 bulk delete 的 recycleActivityDataOnOrderDelete 一致）
  const revResult = await reverseActivityDataForOrder(orderId);
  if (!revResult.ok) {
    console.warn('[deleteOrderById] Reversal failed:', revResult.error);
    // 不阻断删除，仅记录
  }

  // 解绑 points_ledger
  const { error: plError } = await supabaseAdmin
    .from('points_ledger')
    .update({ order_id: null })
    .eq('order_id', orderId);
  if (plError) return { success: false, error: plError.message };

  let dq = supabaseAdmin.from('orders').delete().eq('id', orderId);
  if (tenantId) dq = dq.eq('tenant_id', tenantId);
  const { error } = await dq;
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteMemberByIdRepository(
  memberId: string,
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const errors: string[] = [];

  const { error: plError } = await supabaseAdmin.from('points_ledger').update({ member_id: null }).eq('member_id', memberId);
  if (plError) errors.push(plError.message);

  const { error: agError } = await supabaseAdmin.from('activity_gifts').update({ member_id: null }).eq('member_id', memberId);
  if (agError) errors.push(agError.message);

  const { error: maError } = await supabaseAdmin.from('member_activity').delete().eq('member_id', memberId);
  if (maError) errors.push(maError.message);

  const { data: member } = await supabaseAdmin.from('members').select('member_code').eq('id', memberId).single();
  if (member?.member_code) {
    const { error: paError } = await supabaseAdmin.from('points_accounts').delete().eq('member_code', member.member_code);
    if (paError) errors.push(paError.message);
  }

  const { error: ordError } = await supabaseAdmin.from('orders').update({ member_id: null }).eq('member_id', memberId);
  if (ordError) errors.push(ordError.message);

  let dq = supabaseAdmin.from('members').delete().eq('id', memberId);
  if (tenantId) dq = dq.eq('tenant_id', tenantId);
  const { error } = await dq;
  if (error) errors.push(error.message);

  if (errors.length > 0) return { success: false, error: errors.join('; ') };
  return { success: true };
}
