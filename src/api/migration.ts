/**
 * Migration API Client — 纯 HTTP 请求层
 * 覆盖 /api/migration/* 端点
 */
import { apiPost } from './client';

export const migrationApi = {
  fetchTableData: (tableName: string) =>
    apiPost<unknown[]>('/api/migration/table-data', { table: tableName }),
  getDbStats: (tables: string[]) =>
    apiPost<{ tableCount: number; tables: unknown }>('/api/migration/db-stats', { tables }),
};
