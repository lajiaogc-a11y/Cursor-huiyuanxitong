/**
 * 数据库迁移与表结构 ensure 的单一入口（方案 A）。
 * - `npm run migrate:all` 在部署前执行；任一步失败应使整个命令非零退出。
 * - 生产环境默认不在 app 启动时执行迁移，避免多实例重复重操作与半可用状态。
 *
 * 迁移记录：每个迁移函数执行后记录到 `_migrations` 表，下次部署自动跳过已执行的。
 * 仅 CREATE TABLE / ADD COLUMN 等幂等操作（ensure* 系列）不记录，因为它们本身就是安全的。
 */
import { execute, query } from '../database/index.js';
import { ensureQuotaTable } from '../modules/tenantQuota/repository.js';
import { migrateLotteryTables } from '../modules/lottery/migrate.js';
import { migrateOrdersTable } from '../modules/orders/migrate.js';
import { migrateMemberPortalSettingsColumns } from '../modules/memberPortalSettings/migrate.js';
import { migrateMemberAnalytics } from '../modules/memberAnalytics/migrate.js';
import { migrateInvitationCodesTable } from '../modules/invitations/migrate.js';
import { migrateKnowledgeTenantColumns } from '../modules/knowledge/migrate.js';
import {
  ensureApiKeysTable,
  ensureWebhooksTable,
  ensureApiRequestLogsTable,
  ensureWebhookDeliveryLogsTable,
} from '../modules/data/ensureApiKeysTable.js';
import { ensureLedgerBatchIdColumn } from '../modules/finance/ledgerService.js';
import { ensureArchiveTables } from '../modules/data/ensureArchiveTables.js';
import { migrateSchemaPatches } from './migrateSchemaPatches.js';
import { ensureSystemAnnouncementsAndNotifications } from '../modules/data/ensureSystemAnnouncementsTable.js';
import { migrateCardsTable } from '../modules/giftcards/migrate.js';
import { migrateEmployeesTable } from '../modules/employees/migrate.js';
import { migrateActivityGiftsTable } from '../modules/data/migrateActivityGifts.js';
import { migratePointsGiftCardsTenantColumns } from '../modules/data/migratePointsGiftCardsTenant.js';
import {
  migrateRiskScoresToEmployeeModel,
  migrateErrorReportsFrontendColumns,
} from '../modules/data/migrateRiskAndErrorReports.js';
import { migrateMallRedemptionLedgerMetadata } from '../modules/points/migrateMallRedemptionLedger.js';
import { backfillMallPendingFrozenPoints } from '../modules/points/migrateMallPendingFrozenBackfill.js';

/* ── 迁移记录表 ── */

async function ensureMigrationsTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function hasRun(name: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM _migrations WHERE name = ?',
    [name],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function markRun(name: string): Promise<void> {
  await execute(
    'INSERT IGNORE INTO _migrations (name) VALUES (?)',
    [name],
  );
}

/** 执行一次性迁移：已跑过的自动跳过 */
async function runOnce(name: string, fn: () => Promise<void>): Promise<void> {
  if (await hasRun(name)) {
    console.log(`[migrate] skip (already done): ${name}`);
    return;
  }
  console.log(`[migrate] running: ${name}`);
  await fn();
  await markRun(name);
  console.log(`[migrate] done: ${name}`);
}

export async function runAllMigrations(): Promise<void> {
  // 1. 确保迁移记录表存在
  await ensureMigrationsTable();

  // 2. 幂等的 ensure 操作（每次跑都安全，不需要记录）
  await ensureArchiveTables();
  await ensureSystemAnnouncementsAndNotifications();
  await ensureQuotaTable();
  await ensureApiKeysTable();
  await ensureWebhooksTable();
  await ensureApiRequestLogsTable();
  await ensureWebhookDeliveryLogsTable();
  await ensureLedgerBatchIdColumn();

  // 3. 一次性迁移（跑过一次就不再跑，防止破坏现有数据）
  await runOnce('migrateLotteryTables', migrateLotteryTables);
  const { migrateReferralPhase1, backfillReferralRelationsPhoneCodes } = await import('../modules/referrals/migrate.js');
  await runOnce('migrateReferralPhase1', migrateReferralPhase1);
  await runOnce('backfillReferralRelationsPhoneCodes', backfillReferralRelationsPhoneCodes);
  await runOnce('migrateEmployeesTable', migrateEmployeesTable);
  await runOnce('migrateRiskScoresToEmployeeModel', migrateRiskScoresToEmployeeModel);
  await runOnce('migrateErrorReportsFrontendColumns', migrateErrorReportsFrontendColumns);
  await runOnce('migrateOrdersTable', migrateOrdersTable);
  await runOnce('migrateActivityGiftsTable', migrateActivityGiftsTable);
  await runOnce('migratePointsGiftCardsTenantColumns', migratePointsGiftCardsTenantColumns);
  await runOnce('migrateMallRedemptionLedgerMetadata', migrateMallRedemptionLedgerMetadata);
  await runOnce('migrateCardsTable', migrateCardsTable);
  await runOnce('migrateMemberPortalSettingsColumns', migrateMemberPortalSettingsColumns);
  await runOnce('migrateMemberAnalytics', migrateMemberAnalytics);
  await runOnce('migrateInvitationCodesTable', migrateInvitationCodesTable);
  await runOnce('migrateKnowledgeTenantColumns', migrateKnowledgeTenantColumns);

  // 4. schema patches（内部自带幂等逻辑，含 data_settings；末尾会幂等 ensure 设备白名单表与默认配置）
  await migrateSchemaPatches();

  // 5. 商城待审核单：旧版直扣 balance，回填 frozen 与新版冻结语义对齐（仅执行一次）
  await runOnce('backfillMallPendingFrozenPoints', backfillMallPendingFrozenPoints);
}
