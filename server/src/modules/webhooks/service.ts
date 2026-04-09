/**
 * Webhooks Service — 业务编排层
 *
 * 职责：Webhook 事件入队、租户解析等业务逻辑
 * 数据访问委托 repository.ts
 */
import { selectEmployeeTenantIdById } from './repository.js';

export async function getEmployeeTenantId(employeeId: string): Promise<string | null> {
  return selectEmployeeTenantIdById(employeeId);
}
