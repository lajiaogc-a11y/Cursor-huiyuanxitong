/**
 * user_data_store 表代理 — 员工 JWT 读写
 */
import { apiGetAsStaff, apiPostAsStaff } from './client';

export function getUserDataStoreRow<T = unknown>(query: string) {
  return apiGetAsStaff<T>(`/api/data/table/user_data_store${query ? `?${query}` : ''}`);
}

export function upsertUserDataStoreRow(body: unknown) {
  return apiPostAsStaff('/api/data/table/user_data_store', body);
}
