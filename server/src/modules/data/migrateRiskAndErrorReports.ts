/**
 * 启动迁移：
 * 1) risk_scores：若存在按 member_id 的旧表结构，重命名为备份表并创建按 employee_id 的新表（与 /api/risk 一致）
 * 2) error_reports：补齐前端上报字段（error_id、component_stack、url、user_agent、employee_id）
 */
import { execute, query } from '../../database/index.js';

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name],
  );
  return Number(rows[0]?.cnt) > 0;
}

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(rows[0]?.cnt) > 0;
}

/** 旧版 risk_scores（member_id）与现网 /api/risk（employee_id）不兼容时，备份旧表并建新表 */
export async function migrateRiskScoresToEmployeeModel(): Promise<void> {
  if (!(await tableExists('risk_scores'))) return;

  const hasMember = await tableHasColumn('risk_scores', 'member_id');
  const hasEmployee = await tableHasColumn('risk_scores', 'employee_id');
  if (!hasMember || hasEmployee) return;

  const legacyName = 'risk_scores_legacy_by_member';
  if (await tableExists(legacyName)) {
    console.warn(
      `[API] migrateRiskScores: table ${legacyName} already exists; skip rename (manual fix may be needed)`,
    );
    return;
  }

  await execute(`RENAME TABLE \`risk_scores\` TO \`${legacyName}\``);
  await execute(`
    CREATE TABLE \`risk_scores\` (
      id CHAR(36) NOT NULL PRIMARY KEY,
      employee_id CHAR(36) NOT NULL,
      current_score INT NOT NULL DEFAULT 0,
      risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
      factors JSON NULL,
      last_calculated_at DATETIME(3) NULL,
      auto_action_taken VARCHAR(100) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uk_risk_scores_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(
    `[API] risk_scores: renamed member-based table to ${legacyName}, created employee-based risk_scores`,
  );
}

async function addErrorReportsColumnIfMissing(col: string, ddl: string): Promise<void> {
  if (!(await tableHasColumn('error_reports', col))) {
    await execute(`ALTER TABLE \`error_reports\` ADD COLUMN \`${col}\` ${ddl}`);
  }
}

export async function migrateErrorReportsFrontendColumns(): Promise<void> {
  if (!(await tableExists('error_reports'))) return;

  await addErrorReportsColumnIfMissing('error_id', 'VARCHAR(120) NULL');
  await addErrorReportsColumnIfMissing('component_stack', 'TEXT NULL');
  await addErrorReportsColumnIfMissing('url', 'TEXT NULL');
  await addErrorReportsColumnIfMissing('user_agent', 'TEXT NULL');
  await addErrorReportsColumnIfMissing('employee_id', 'CHAR(36) NULL');

  console.log('[API] error_reports: frontend report columns ensured');
}
