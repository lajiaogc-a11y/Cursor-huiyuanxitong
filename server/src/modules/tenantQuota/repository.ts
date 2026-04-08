import { query, queryOne, execute } from '../../database/index.js';

export async function ensureQuotaTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS tenant_quotas (
      tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
      max_employees INT NULL DEFAULT NULL,
      max_members INT NULL DEFAULT NULL,
      max_daily_orders INT NULL DEFAULT NULL,
      exceed_strategy VARCHAR(10) NOT NULL DEFAULT 'BLOCK',
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export interface QuotaRow {
  tenant_id: string;
  max_employees: number | null;
  max_members: number | null;
  max_daily_orders: number | null;
  exceed_strategy: string;
  updated_at: string;
}

export async function getQuotaByTenantId(tenantId: string): Promise<QuotaRow | null> {
  return queryOne<QuotaRow>(
    'SELECT * FROM tenant_quotas WHERE tenant_id = ?',
    [tenantId]
  );
}

export async function listAllQuotas(): Promise<QuotaRow[]> {
  return query<QuotaRow>('SELECT * FROM tenant_quotas ORDER BY updated_at DESC');
}

export async function upsertQuota(
  tenantId: string,
  maxEmployees: number | null,
  maxMembers: number | null,
  maxDailyOrders: number | null,
  exceedStrategy: string
): Promise<void> {
  await execute(
    `INSERT INTO tenant_quotas (tenant_id, max_employees, max_members, max_daily_orders, exceed_strategy)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       max_employees = VALUES(max_employees),
       max_members = VALUES(max_members),
       max_daily_orders = VALUES(max_daily_orders),
       exceed_strategy = VALUES(exceed_strategy)`,
    [tenantId, maxEmployees, maxMembers, maxDailyOrders, exceedStrategy || 'BLOCK']
  );
}

export async function countEmployees(tenantId: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM employees WHERE tenant_id = ? AND (status = 'active' OR status IS NULL)",
    [tenantId]
  );
  return row?.cnt ?? 0;
}

export async function countMembers(tenantId: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM members WHERE tenant_id = ?',
    [tenantId]
  );
  return row?.cnt ?? 0;
}

export async function countDailyOrders(tenantId: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM orders
     WHERE tenant_id = ?
       AND created_at >= CURDATE()
       AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       AND (is_deleted = false OR is_deleted IS NULL)`,
    [tenantId]
  );
  return row?.cnt ?? 0;
}
