/**
 * 冷热归档表：未跑过 fix_schema 的库会缺表，导致「归档数据」页与 archive_old_data RPC 报错
 */
import { execute, queryOne } from '../../database/index.js';

async function tableExists(tableName: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(r?.c) > 0;
}

/** 与 migrateSchemaPatches.ts 中 archive 段一致 */
export async function ensureArchiveTables(): Promise<void> {
  if (!(await tableExists('archived_orders'))) {
    await execute(`
      CREATE TABLE archived_orders (
        id CHAR(36) NOT NULL PRIMARY KEY,
        original_id CHAR(36) NOT NULL,
        order_number VARCHAR(255) NOT NULL,
        order_type VARCHAR(100) NOT NULL DEFAULT 'order',
        phone_number VARCHAR(50) NULL,
        currency VARCHAR(50) NULL,
        amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        actual_payment DECIMAL(18,2) NULL,
        exchange_rate DECIMAL(18,6) NULL,
        fee DECIMAL(18,2) NULL,
        profit_ngn DECIMAL(18,2) NULL,
        profit_usdt DECIMAL(18,2) NULL,
        status VARCHAR(50) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        completed_at DATETIME(3) NULL,
        archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        original_data JSON NOT NULL,
        KEY idx_archived_orders_original (original_id),
        KEY idx_archived_orders_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('archived_operation_logs'))) {
    await execute(`
      CREATE TABLE archived_operation_logs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        original_id CHAR(36) NOT NULL,
        module VARCHAR(100) NOT NULL DEFAULT '',
        operation_type VARCHAR(100) NOT NULL DEFAULT '',
        operator_account VARCHAR(255) NOT NULL DEFAULT '',
        operator_role VARCHAR(50) NOT NULL DEFAULT '',
        timestamp DATETIME(3) NULL,
        archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        original_data JSON NOT NULL,
        KEY idx_archived_op_logs_ts (timestamp),
        KEY idx_archived_op_logs_orig (original_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('archived_points_ledger'))) {
    await execute(`
      CREATE TABLE archived_points_ledger (
        id CHAR(36) NOT NULL PRIMARY KEY,
        original_id CHAR(36) NOT NULL,
        phone_number VARCHAR(50) NULL,
        member_code VARCHAR(50) NULL,
        points_earned DECIMAL(18,2) NOT NULL DEFAULT 0,
        transaction_type VARCHAR(100) NOT NULL DEFAULT '',
        created_at DATETIME(3) NOT NULL,
        archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        original_data JSON NOT NULL,
        KEY idx_archived_points_created (created_at),
        KEY idx_archived_points_orig (original_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  if (!(await tableExists('archive_runs'))) {
    await execute(`
      CREATE TABLE archive_runs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        tables_processed JSON NOT NULL,
        records_archived JSON NOT NULL,
        records_deleted JSON NOT NULL,
        duration_ms INT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        error_message TEXT NULL,
        triggered_by VARCHAR(100) NOT NULL DEFAULT 'manual',
        KEY idx_archive_runs_run_at (run_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
