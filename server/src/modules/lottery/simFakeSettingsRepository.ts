import { query, execute } from '../../database/index.js';
import {
  buildSpinFakeUserPoolFromNames,
  parseNicknameLines,
  type SpinFakeUserJson,
} from './spinFakeNicknameParse.js';

export interface LotterySimFakeSettingsRow {
  tenant_id: string;
  nicknames_raw: string;
  /** MySQL JSON 列：驱动可能返回 string 或已解析的数组 */
  pool_json: string | unknown;
  updated_at: Date;
}

export async function getLotterySimFakeSettingsRow(tenantId: string): Promise<LotterySimFakeSettingsRow | null> {
  const rows = await query<LotterySimFakeSettingsRow>(
    `SELECT tenant_id, nicknames_raw, pool_json, updated_at
     FROM lottery_sim_fake_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

export async function upsertLotterySimFakeSettings(
  tenantId: string,
  nicknamesRaw: string,
  pool: SpinFakeUserJson[],
): Promise<void> {
  const json = JSON.stringify(pool);
  await execute(
    `INSERT INTO lottery_sim_fake_settings (tenant_id, nicknames_raw, pool_json, updated_at)
     VALUES (?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE nicknames_raw = VALUES(nicknames_raw), pool_json = VALUES(pool_json), updated_at = NOW(3)`,
    [tenantId, nicknamesRaw, json],
  );
}

export async function deleteLotterySimFakeSettings(tenantId: string): Promise<void> {
  await execute(`DELETE FROM lottery_sim_fake_settings WHERE tenant_id = ?`, [tenantId]);
}

/** 解析并生成 100 人池；空输入返回 null（表示用内置池） */
export function buildPoolFromRawText(raw: string): SpinFakeUserJson[] | null {
  const lines = parseNicknameLines(raw);
  if (lines.length === 0) return null;
  return buildSpinFakeUserPoolFromNames(lines);
}
