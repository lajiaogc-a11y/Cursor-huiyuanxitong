import type { PoolConnection } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { pickLevelRuleForTotalPoints } from './compute.js';
import type { MemberLevelRuleInput, MemberLevelRuleRow } from './types.js';

async function qOne<T>(conn: PoolConnection, sql: string, params?: unknown[]): Promise<T | null> {
  const [rows] = await conn.query(sql, params ?? []);
  const arr = rows as T[];
  return arr[0] ?? null;
}

async function exec(conn: PoolConnection, sql: string, params?: unknown[]): Promise<void> {
  await conn.query(sql, params ?? []);
}

/** 尼日利亚市场默认阶梯（可后台改） */
export const DEFAULT_MEMBER_LEVEL_SEED: ReadonlyArray<readonly [string, number, number]> = [
  ['Starter', 0, 1],
  ['Bronze', 500, 2],
  ['Silver', 2000, 3],
  ['Gold', 5000, 4],
  ['Platinum', 10000, 5],
  ['Diamond', 20000, 6],
  ['Elite', 50000, 7],
];

function normalizeRuleRow(r: MemberLevelRuleRow): MemberLevelRuleRow {
  return {
    ...r,
    level_name_zh: String((r as { level_name_zh?: string }).level_name_zh ?? '').trim(),
    required_points: Number(r.required_points),
    level_order: Number(r.level_order),
    rate_bonus: r.rate_bonus != null ? Number(r.rate_bonus) : null,
    priority_level: r.priority_level != null ? Number(r.priority_level) : null,
  };
}

export async function listMemberLevelRulesRepository(tenantId: string): Promise<MemberLevelRuleRow[]> {
  const rows = await query<MemberLevelRuleRow>(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order,
            rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules
     WHERE tenant_id = ?
     ORDER BY level_order ASC, required_points ASC, id ASC`,
    [tenantId],
  );
  return rows.map((r) => normalizeRuleRow(r));
}

export async function listMemberLevelRulesOrderedForCompute(tenantId: string): Promise<MemberLevelRuleRow[]> {
  const rows = await query<MemberLevelRuleRow>(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order,
            rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules
     WHERE tenant_id = ?
     ORDER BY required_points ASC, level_order ASC, id ASC`,
    [tenantId],
  );
  return rows.map((r) => normalizeRuleRow(r));
}

export async function ensureDefaultMemberLevelRulesRepository(tenantId: string): Promise<void> {
  const cntRows = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM member_level_rules WHERE tenant_id = ?`,
    [tenantId],
  );
  if (Number(cntRows[0]?.n ?? 0) > 0) return;
  for (const [name, pts, ord] of DEFAULT_MEMBER_LEVEL_SEED) {
    const id = randomUUID();
    await execute(
      `INSERT INTO member_level_rules (
         id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
       ) VALUES (?, ?, ?, '', ?, ?, NULL, NULL, NOW(3), NOW(3))`,
      [id, tenantId, name, pts, ord],
    );
  }
}

/** 事务内：按累计积分写回 current_level_id / member_level */
export async function syncMemberLevelFromTotalOnConn(
  conn: PoolConnection,
  memberId: string,
  tenantId: string | null,
  totalPoints: number,
): Promise<void> {
  if (!tenantId) return;
  await ensureDefaultMemberLevelRulesOnConn(conn, tenantId);
  const [rows] = await conn.query(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules
     WHERE tenant_id = ?
     ORDER BY required_points ASC, level_order ASC, id ASC`,
    [tenantId],
  );
  const list = rows as MemberLevelRuleRow[];
  const normalized = list.map((r) => ({
    ...r,
    level_name_zh: String((r as { level_name_zh?: string }).level_name_zh ?? '').trim(),
    required_points: Number(r.required_points),
    level_order: Number(r.level_order),
  }));
  const best = pickLevelRuleForTotalPoints(normalized, totalPoints);
  if (!best) return;
  await exec(
    conn,
    `UPDATE members SET current_level_id = ?, member_level = ?, updated_at = NOW(3) WHERE id = ?`,
    [best.id, best.level_name, memberId],
  );
}

async function ensureDefaultMemberLevelRulesOnConn(conn: PoolConnection, tenantId: string): Promise<void> {
  const row = await qOne<{ n: number }>(
    conn,
    `SELECT COUNT(*) AS n FROM member_level_rules WHERE tenant_id = ?`,
    [tenantId],
  );
  if (Number(row?.n ?? 0) > 0) return;
  for (const [name, pts, ord] of DEFAULT_MEMBER_LEVEL_SEED) {
    const id = randomUUID();
    await exec(
      conn,
      `INSERT INTO member_level_rules (
         id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
       ) VALUES (?, ?, ?, '', ?, ?, NULL, NULL, NOW(3), NOW(3))`,
      [id, tenantId, name, pts, ord],
    );
  }
}

export async function replaceMemberLevelRulesRepository(tenantId: string, rules: MemberLevelRuleInput[]): Promise<MemberLevelRuleRow[]> {
  // M3 fix: wrap DELETE + INSERTs in a transaction to prevent partial state on crash
  await withTransaction(async (conn) => {
    await conn.query(`DELETE FROM member_level_rules WHERE tenant_id = ?`, [tenantId]);
    for (const r of rules) {
      const id = randomUUID();
      await conn.query(
        `INSERT INTO member_level_rules (
           id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          id,
          tenantId,
          String(r.level_name || '').trim() || 'Level',
          String(r.level_name_zh ?? '').trim(),
          Number(r.required_points) || 0,
          Number(r.level_order) || 0,
          r.rate_bonus != null && Number.isFinite(Number(r.rate_bonus)) ? Number(r.rate_bonus) : null,
          r.priority_level != null && Number.isFinite(Number(r.priority_level)) ? Number(r.priority_level) : null,
        ],
      );
    }
  });
  return listMemberLevelRulesRepository(tenantId);
}

export async function getMemberLevelRuleByNameRepository(
  tenantId: string,
  levelName: string,
): Promise<MemberLevelRuleRow | null> {
  const name = String(levelName || '').trim();
  if (!name) return null;
  await ensureDefaultMemberLevelRulesRepository(tenantId);
  const row = await queryOne<MemberLevelRuleRow>(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules WHERE tenant_id = ? AND level_name = ? LIMIT 1`,
    [tenantId, name],
  );
  if (!row) return null;
  return normalizeRuleRow(row);
}

export async function getMemberLevelRuleByIdRepository(
  id: string,
  tenantId: string,
): Promise<MemberLevelRuleRow | null> {
  const row = await queryOne<MemberLevelRuleRow>(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [id, tenantId],
  );
  if (!row) return null;
  return normalizeRuleRow(row);
}

export async function getLowestMemberLevelRuleRepository(tenantId: string): Promise<MemberLevelRuleRow | null> {
  await ensureDefaultMemberLevelRulesRepository(tenantId);
  const row = await queryOne<MemberLevelRuleRow>(
    `SELECT id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
     FROM member_level_rules
     WHERE tenant_id = ?
     ORDER BY level_order ASC, required_points ASC, id ASC
     LIMIT 1`,
    [tenantId],
  );
  if (!row) return null;
  return normalizeRuleRow(row);
}

export async function recomputeAllMemberLevelsForTenantRepository(tenantId: string): Promise<void> {
  await ensureDefaultMemberLevelRulesRepository(tenantId);
  const rules = await listMemberLevelRulesOrderedForCompute(tenantId);
  const members = await query<{ id: string; total_points: number | string }>(
    `SELECT id, total_points FROM members WHERE tenant_id = ?`,
    [tenantId],
  );
  for (const m of members) {
    const best = pickLevelRuleForTotalPoints(rules, Number(m.total_points) || 0);
    if (!best) continue;
    await execute(`UPDATE members SET current_level_id = ?, member_level = ?, updated_at = NOW(3) WHERE id = ?`, [
      best.id,
      best.level_name,
      m.id,
    ]);
  }
}

/** 按 current_level_id 或英文 level_name 解析规则表中的中文名（供 API 展示） */
export async function resolveLevelNameZhForMember(
  tenantId: string | null | undefined,
  currentLevelId: string | null | undefined,
  memberLevel: string | null | undefined,
): Promise<string | null> {
  const tid = tenantId != null ? String(tenantId).trim() : '';
  if (!tid) return null;
  const cid = currentLevelId != null ? String(currentLevelId).trim() : '';
  if (cid) {
    const byId = await queryOne<{ level_name_zh: string | null }>(
      `SELECT level_name_zh FROM member_level_rules WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tid, cid],
    );
    const z = byId?.level_name_zh != null ? String(byId.level_name_zh).trim() : '';
    if (z) return z;
  }
  const lv = memberLevel != null ? String(memberLevel).trim() : '';
  if (!lv) return null;
  const byName = await queryOne<{ level_name_zh: string | null }>(
    `SELECT level_name_zh FROM member_level_rules WHERE tenant_id = ? AND level_name = ? LIMIT 1`,
    [tid, lv],
  );
  const z2 = byName?.level_name_zh != null ? String(byName.level_name_zh).trim() : '';
  return z2 || null;
}
