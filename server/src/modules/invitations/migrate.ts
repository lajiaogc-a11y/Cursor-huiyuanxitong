/**
 * 邀请码表与 generate_invitation_code RPC 对齐（幂等，启动时执行）
 */
import { execute, query, queryOne } from '../../database/index.js';

export async function migrateInvitationCodesTable(): Promise<void> {
  const t = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invitation_codes'`,
  );
  if (!Number(t?.c)) return;

  const cols = await query<{ COLUMN_NAME: string; IS_NULLABLE: string }>(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invitation_codes'`,
  );
  const byName = new Map(cols.map((r) => [r.COLUMN_NAME, r]));

  if (!byName.has('tenant_id')) {
    await execute(`ALTER TABLE invitation_codes ADD COLUMN tenant_id CHAR(36) NULL AFTER code`);
  }
  if (!byName.has('status')) {
    await execute(
      `ALTER TABLE invitation_codes ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active' AFTER tenant_id`,
    );
  }
  if (!byName.has('created_by')) {
    await execute(`ALTER TABLE invitation_codes ADD COLUMN created_by CHAR(36) NULL AFTER used_count`);
  }

  const memberCol = byName.get('member_id');
  if (memberCol && memberCol.IS_NULLABLE === 'NO') {
    await execute(`ALTER TABLE invitation_codes MODIFY COLUMN member_id CHAR(36) NULL`);
  }
}
