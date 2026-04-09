/**
 * Data repository — data_settings, shared_data_store, activity data aggregate, spin_credits
 */
import { query, queryOne, execute } from '../../database/index.js';

/** 解析 JSON 列：非法字符串不抛错，避免拖垮整条 API 链 */
export function safeParseJsonColumn(value: unknown, context?: string): unknown | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch (e) {
    console.error(`[Data] JSON parse failed${context ? ` (${context})` : ''}:`, e);
    return null;
  }
}

export async function getIpAccessControlSettingRepository(): Promise<unknown | null> {
  const row = await queryOne<{ setting_value: unknown }>(
    `SELECT setting_value FROM data_settings WHERE setting_key = 'ip_access_control' LIMIT 1`
  );
  if (!row?.setting_value) return null;
  return safeParseJsonColumn(row.setting_value, 'ip_access_control');
}

export async function getSharedDataRepository(tenantId: string | null, dataKey: string): Promise<unknown> {
  // 平台超管 tenantId 可能为 null，用 IS NULL 匹配或用平台租户
  const row = tenantId
    ? await queryOne<{ store_value: unknown }>(
        `SELECT store_value FROM shared_data_store WHERE tenant_id = ? AND store_key = ? LIMIT 1`,
        [tenantId, dataKey]
      )
    : await queryOne<{ store_value: unknown }>(
        `SELECT store_value FROM shared_data_store WHERE store_key = ? LIMIT 1`,
        [dataKey]
      );
  if (!row) return null;
  return safeParseJsonColumn(row.store_value, `shared_data_store:${dataKey}`);
}

export async function upsertSharedDataRepository(tenantId: string | null, dataKey: string, dataValue: unknown): Promise<boolean> {
  try {
    let jsonVal: string;
    try {
      jsonVal = JSON.stringify(dataValue ?? null);
    } catch (e) {
      console.error('[SharedData] JSON.stringify failed (circular/BigInt?):', e);
      return false;
    }
    const existing = tenantId
      ? await queryOne('SELECT id FROM shared_data_store WHERE tenant_id = ? AND store_key = ? LIMIT 1', [tenantId, dataKey])
      : await queryOne('SELECT id FROM shared_data_store WHERE store_key = ? LIMIT 1', [dataKey]);
    if (existing) {
      if (tenantId) {
        await execute('UPDATE shared_data_store SET store_value = ?, updated_at = NOW() WHERE tenant_id = ? AND store_key = ?', [jsonVal, tenantId, dataKey]);
      } else {
        await execute('UPDATE shared_data_store SET store_value = ?, updated_at = NOW() WHERE store_key = ?', [jsonVal, dataKey]);
      }
    } else {
      await execute(
        'INSERT INTO shared_data_store (id, tenant_id, store_key, store_value, updated_at) VALUES (UUID(), ?, ?, ?, NOW())',
        [tenantId, dataKey, jsonVal]
      );
    }
    return true;
  } catch (e) {
    console.error('[SharedData] upsert error:', e);
    return false;
  }
}

export async function getMultipleSharedDataRepository(tenantId: string | null, dataKeys: string[]): Promise<Record<string, unknown>> {
  if (dataKeys.length === 0) return {};
  const placeholders = dataKeys.map(() => '?').join(',');
  const rows = tenantId
    ? await query<{ store_key: string; store_value: unknown }>(
        `SELECT store_key, store_value FROM shared_data_store WHERE tenant_id = ? AND store_key IN (${placeholders})`,
        [tenantId, ...dataKeys]
      )
    : await query<{ store_key: string; store_value: unknown }>(
        `SELECT store_key, store_value FROM shared_data_store WHERE store_key IN (${placeholders})`,
        dataKeys
      );
  const result: Record<string, unknown> = {};
  rows.forEach((r) => {
    result[r.store_key] = safeParseJsonColumn(r.store_value, `shared_data_store batch:${r.store_key}`);
  });
  return result;
}

/**
 * Merge points_ledger rows with points_log rows, deduplicating entries
 * that exist in both tables (same member_id, similar timestamp, similar amount).
 * points_ledger entries take precedence; points_log entries only fill gaps.
 */
function mergePointsLedgerAndLog(
  ledgerRows: Record<string, unknown>[],
  logRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (logRows.length === 0) return ledgerRows;

  // Type equivalence map: ledger type → legacy points_log types that represent the same event
  const LEDGER_LOG_EQUIV: Record<string, string[]> = {
    freeze: ['redeem', 'freeze'],
    redeem_confirmed: ['redeem', 'redeem_confirmed'],
    redeem_cancelled: ['refund', 'redeem_cancelled'],
    redeem_rejected: ['refund', 'redeem_rejected'],
  };

  function typesMatch(ledgerType: string, logType: string): boolean {
    if (ledgerType === logType) return true;
    const equiv = LEDGER_LOG_EQUIV[ledgerType];
    return equiv ? equiv.includes(logType) : false;
  }

  const ledgerByMember = new Map<string, { ts: number; amt: number; type: string }[]>();
  for (const r of ledgerRows) {
    const mid = String(r.member_id ?? '');
    if (!mid) continue;
    const ts = new Date(String(r.created_at ?? '')).getTime();
    const amt = Math.abs(Number(r.amount ?? 0));
    const type = String(r.type ?? r.transaction_type ?? '');
    if (!ledgerByMember.has(mid)) ledgerByMember.set(mid, []);
    ledgerByMember.get(mid)!.push({ ts, amt, type });
  }

  const deduped: Record<string, unknown>[] = [];
  for (const r of logRows) {
    const mid = String(r.member_id ?? '');
    const ts = new Date(String(r.created_at ?? '')).getTime();
    const amt = Math.abs(Number(r.amount ?? 0));
    const type = String(r.type ?? r.transaction_type ?? '');
    const existing = ledgerByMember.get(mid);
    const hasDup = existing?.some((e) => {
      if (Math.abs(e.ts - ts) > 2000) return false;
      if (!typesMatch(e.type, type)) return false;
      // For audit-only entries (ledger amount=0, e.g. redeem_confirmed), skip amount check —
      // old points_log wrote -cost while ledger correctly wrote 0
      if (e.amt === 0) return true;
      return Math.abs(e.amt - amt) < 0.02;
    });
    if (!hasDup) deduped.push(r);
  }

  return [...ledgerRows, ...deduped];
}

/** 活动数据 */
export async function listActivityDataRepository(tenantId: string | null): Promise<{
  gifts: unknown[];
  referrals: unknown[];
  memberActivities: unknown[];
  pointsLedgerData: unknown[];
  pointsAccountsData: unknown[];
  spinCreditsData: unknown[];
}> {
  if (!tenantId) {
    return { gifts: [], referrals: [], memberActivities: [], pointsLedgerData: [], pointsAccountsData: [], spinCreditsData: [] };
  }

  const pick = <T>(label: string, result: PromiseSettledResult<T[]>): T[] => {
    if (result.status === 'fulfilled') return result.value ?? [];
    console.error(`[Data] listActivityData ${label} failed:`, result.reason);
    return [];
  };

  const [giftsRes, referralsRes, memberActivitiesRes, pointsLedgerRes, pointsLogRes, pointsAccountsRes, spinCreditsRes] = await Promise.allSettled([
    query(
      `SELECT ag.* FROM activity_gifts ag
       INNER JOIN employees e ON e.id = ag.creator_id AND e.tenant_id = ?
       ORDER BY ag.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT rr.* FROM referral_relations rr
       INNER JOIN members m ON m.phone_number = rr.referrer_phone AND m.tenant_id = ?
       ORDER BY rr.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT ma.* FROM member_activity ma
       INNER JOIN members m ON m.id = ma.member_id AND m.tenant_id = ?
       ORDER BY ma.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT pl.* FROM points_ledger pl
       WHERE pl.member_id IN (SELECT id FROM members WHERE tenant_id = ?)
          OR pl.creator_id IN (SELECT id FROM employees WHERE tenant_id = ?)
          OR pl.order_id IN (SELECT id FROM orders WHERE tenant_id = ?)
       ORDER BY pl.created_at DESC`,
      [tenantId, tenantId, tenantId]
    ),
    query(
      `SELECT pl.id, pl.member_id, pl.\`change\` AS amount, pl.type,
              pl.type AS transaction_type, pl.remark AS description,
              pl.balance_after, pl.created_at, pl.tenant_id,
              'issued' AS status, pl.category, pl.reference_id,
              '__points_log' AS _source
       FROM points_log pl
       WHERE pl.member_id IN (SELECT id FROM members WHERE tenant_id = ?)
       ORDER BY pl.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT pa.* FROM points_accounts pa
       INNER JOIN members m ON m.id = pa.member_id AND m.tenant_id = ?
       ORDER BY COALESCE(pa.updated_at, pa.last_updated) DESC`,
      [tenantId]
    ),
    query(
      `SELECT sc.member_id, SUM(sc.amount) AS total_spins, sc.source
       FROM spin_credits sc
       INNER JOIN members m ON m.id = sc.member_id AND m.tenant_id = ?
       GROUP BY sc.member_id, sc.source`,
      [tenantId]
    ),
  ]);

  const ledgerRows = pick('points_ledger', pointsLedgerRes) as Record<string, unknown>[];
  const logRows = pick('points_log', pointsLogRes) as Record<string, unknown>[];
  const mergedPointsData = mergePointsLedgerAndLog(ledgerRows, logRows);

  return {
    gifts: pick('activity_gifts', giftsRes),
    referrals: pick('referral_relations', referralsRes),
    memberActivities: pick('member_activity', memberActivitiesRes),
    pointsLedgerData: mergedPointsData,
    pointsAccountsData: pick('points_accounts', pointsAccountsRes),
    spinCreditsData: pick('spin_credits', spinCreditsRes),
  };
}

export async function getSpinCreditsDetailRepository(memberId: string) {
  const { reconcileSpinBalance } = await import('../lottery/spinBalanceAccount.js');

  const [credits, remaining] = await Promise.all([
    query(
      `SELECT id, member_id, source, amount, used, created_at
       FROM spin_credits
       WHERE member_id = ?
       ORDER BY created_at ASC, id ASC`,
      [memberId],
    ),
    reconcileSpinBalance(memberId),
  ]);

  const rawRows = (credits as { id: string; source: string; amount: number; used: number; created_at: string }[]);
  let runningBalance = 0;
  const rows = rawRows.map((row) => {
    const before = runningBalance;
    const amt = Math.floor(Number(row.amount ?? 0));
    runningBalance += amt;
    return {
      created_at: row.created_at,
      amount: amt,
      source: row.source ?? '',
      balance_before: before,
      balance_after: runningBalance,
    };
  });

  rows.reverse();
  return { credits: rows, remaining, totalEarned: runningBalance };
}

export async function getDataDebugCountsRepository() {
  const [opRes, loginRes, catRes] = await Promise.all([
    query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM operation_logs'),
    query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM employee_login_logs'),
    query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM knowledge_categories'),
  ]);
  return {
    operationLogsCount: Number(opRes[0]?.cnt ?? 0),
    loginLogsCount: Number(loginRes[0]?.cnt ?? 0),
    knowledgeCategoriesCount: Number(catRes[0]?.cnt ?? 0),
  };
}
