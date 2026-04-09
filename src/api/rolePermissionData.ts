/**
 * role_permissions 表代理 — 列表 / Upsert
 */
import { apiGet, apiPost } from './client';


export type RolePermissionRow = {
  id?: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export function listRolePermissionsData(query: string) {
  return apiGet<RolePermissionRow[]>(`/api/data/table/role_permissions${query ? `?${query}` : ''}`);
}

export function upsertRolePermissionsData(rows: RolePermissionRow[]) {
  return apiPost('/api/data/table/role_permissions', { data: rows, upsert: true, onConflict: 'role,module_name,field_name' });
}
