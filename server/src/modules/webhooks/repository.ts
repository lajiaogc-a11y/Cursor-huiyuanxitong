/**
 * Webhooks 队列入库相关的数据访问
 */
import { queryOne } from '../../database/index.js';

export async function selectEmployeeTenantIdById(employeeId: string): Promise<string | null> {
  const row = await queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM `employees` WHERE `id` = ? LIMIT 1',
    [employeeId],
  );
  return row?.tenant_id ?? null;
}
