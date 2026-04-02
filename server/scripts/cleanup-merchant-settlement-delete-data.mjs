/**
 * 等效于：系统设置 → 数据删除，勾选
 * - 「变动明细 + 账本明细」+ 保留月数 0（全量）
 * - 「商家结算档案」
 *
 * 用法（在 server 目录）：
 *   node scripts/cleanup-merchant-settlement-delete-data.mjs --yes
 *
 * 可选环境变量（与 bulkDeleteRepository 一致）：
 *   CLEANUP_TENANT_ID=<uuid>  仅删除该租户的 shared_data_store 结算键；为空则不限定租户（与平台超管一致）
 *
 * 账本/变动明细：当前后台 bulk 实现为全库 WHERE id <> 全零 UUID（不按租户过滤），本脚本保持一致。
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const NULL_UUID = '00000000-0000-0000-0000-000000000000';

if (!process.argv.includes('--yes')) {
  console.error('此为破坏性操作。若确认执行，请追加参数: --yes');
  process.exit(1);
}

const host = process.env.MYSQL_HOST ?? 'localhost';
const port = parseInt(process.env.MYSQL_PORT ?? '3306', 10);
const user = process.env.MYSQL_USER ?? 'root';
const password = process.env.MYSQL_PASSWORD ?? '';
const database = process.env.MYSQL_DATABASE ?? 'gc_member_system';
const tenantId = process.env.CLEANUP_TENANT_ID?.trim() || null;

const conn = await mysql.createConnection({ host, port, user, password, database });
try {
  // 1) ledger_transactions + balance_change_logs（与 admin bulkDelete retainMonths=0 相同）
  const [lr] = await conn.execute(
    `DELETE FROM ledger_transactions WHERE id <> ?`,
    [NULL_UUID],
  );
  const ledgerDeleted = lr.affectedRows ?? 0;
  console.log(`[OK] ledger_transactions 删除行数: ${ledgerDeleted}`);

  const [br] = await conn.execute(
    `DELETE FROM balance_change_logs WHERE id <> ?`,
    [NULL_UUID],
  );
  const balanceDeleted = br.affectedRows ?? 0;
  console.log(`[OK] balance_change_logs 删除行数: ${balanceDeleted}`);

  // 2) shared_data_store 商家结算档案
  const exactKeys = ['cardMerchantSettlements', 'paymentProviderSettlements'];
  const ph = exactKeys.map(() => '?').join(', ');
  let where = `(store_key IN (${ph}) OR store_key LIKE 'merchant_initial_balance_%' OR store_key LIKE 'settlement_last_reset_%')`;
  const qvals = [...exactKeys];
  if (tenantId) {
    where = `(${where}) AND tenant_id = ?`;
    qvals.push(tenantId);
  }
  const [rows] = await conn.execute(`SELECT id, store_key FROM shared_data_store WHERE ${where}`, qvals);
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    console.log('[OK] shared_data_store 无匹配结算档案行（可能已清空）');
  } else {
    const ids = list.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(', ');
    await conn.execute(`DELETE FROM shared_data_store WHERE id IN (${placeholders})`, ids);
    console.log(`[OK] shared_data_store 已删除 ${ids.length} 行:`, list.map((r) => r.store_key).join(', '));
  }

  if (tenantId) {
    console.log(`[INFO] 已按 CLEANUP_TENANT_ID 限定结算档案删除；账本两表为全库清理（与现网后台逻辑一致）。`);
  }
} catch (e) {
  console.error('[FAIL]', e?.message ?? e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
