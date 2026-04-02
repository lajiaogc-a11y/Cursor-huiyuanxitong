/**
 * points_accounts / points_ledger / gift_cards 补齐 tenant_id、索引与回填（与表代理 TENANT_SCOPED、租户迁移一致）
 */
import { execute, query } from '../../database/index.js';

async function tableExists(name: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [name],
  );
  return rows.length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 AS cnt FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, indexName],
  );
  return rows.length > 0;
}

export async function migratePointsGiftCardsTenantColumns(): Promise<void> {
  if (await tableExists('points_accounts')) {
    if (!(await columnExists('points_accounts', 'tenant_id'))) {
      await execute(
        `ALTER TABLE points_accounts ADD COLUMN tenant_id CHAR(36) NULL AFTER member_id`,
      );
    }
    if (!(await indexExists('points_accounts', 'idx_points_accounts_tenant'))) {
      await execute(`ALTER TABLE points_accounts ADD KEY idx_points_accounts_tenant (tenant_id)`);
    }
    await execute(
      `UPDATE points_accounts pa
       INNER JOIN members m ON m.id = pa.member_id
       SET pa.tenant_id = m.tenant_id
       WHERE pa.tenant_id IS NULL AND m.tenant_id IS NOT NULL`,
    );

    // 汇率计算器 / 积分清零 / pointsAccountStore 等依赖的列（与 mysql/fix_columns.sql 一致）
    const addPaCol = async (col: string, ddl: string) => {
      if (!(await columnExists('points_accounts', col))) {
        await execute(`ALTER TABLE points_accounts ADD COLUMN \`${col}\` ${ddl}`);
      }
    };
    await addPaCol('member_code', 'VARCHAR(50) NULL');
    await addPaCol('last_updated', 'DATETIME(3) NULL');
    await addPaCol('phone', 'VARCHAR(50) NULL');
    await addPaCol('last_reset_time', 'DATETIME(3) NULL');
    await addPaCol('points_accrual_start_time', 'DATETIME(3) NULL');

    await execute(
      `UPDATE points_accounts pa
       INNER JOIN members m ON m.id = pa.member_id
       SET pa.member_code = IF(pa.member_code IS NULL OR pa.member_code = '', m.member_code, pa.member_code),
           pa.phone = IF(pa.phone IS NULL OR pa.phone = '', m.phone_number, pa.phone)
       WHERE (pa.member_code IS NULL OR pa.member_code = '')
          OR (pa.phone IS NULL OR pa.phone = '')`,
    );

    if (!(await indexExists('points_accounts', 'idx_points_accounts_member_code'))) {
      await execute(`ALTER TABLE points_accounts ADD KEY idx_points_accounts_member_code (member_code)`);
    }
    if (!(await indexExists('points_accounts', 'idx_points_accounts_phone'))) {
      await execute(`ALTER TABLE points_accounts ADD KEY idx_points_accounts_phone (phone)`);
    }
  }

  if (await tableExists('points_ledger')) {
    if (!(await columnExists('points_ledger', 'tenant_id'))) {
      await execute(
        `ALTER TABLE points_ledger ADD COLUMN tenant_id CHAR(36) NULL AFTER member_id`,
      );
    }
    if (!(await indexExists('points_ledger', 'idx_points_ledger_tenant'))) {
      await execute(`ALTER TABLE points_ledger ADD KEY idx_points_ledger_tenant (tenant_id)`);
    }
    await execute(
      `UPDATE points_ledger pl
       INNER JOIN members m ON m.id = pl.member_id
       SET pl.tenant_id = m.tenant_id
       WHERE pl.tenant_id IS NULL AND m.tenant_id IS NOT NULL`,
    );
  }

  if (await tableExists('gift_cards')) {
    if (!(await columnExists('gift_cards', 'tenant_id'))) {
      await execute(`ALTER TABLE gift_cards ADD COLUMN tenant_id CHAR(36) NULL AFTER id`);
    }
    if (!(await indexExists('gift_cards', 'idx_gift_cards_tenant'))) {
      await execute(`ALTER TABLE gift_cards ADD KEY idx_gift_cards_tenant (tenant_id)`);
    }
    await execute(
      `UPDATE gift_cards gc
       LEFT JOIN members m ON m.id = gc.member_id
       LEFT JOIN employees e ON e.id = gc.creator_id
       SET gc.tenant_id = COALESCE(m.tenant_id, e.tenant_id)
       WHERE gc.tenant_id IS NULL
         AND (m.tenant_id IS NOT NULL OR e.tenant_id IS NOT NULL)`,
    );
  }
}
