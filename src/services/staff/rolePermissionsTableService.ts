/**
 * role_permissions 表代理：导入/导出
 */
import { apiGet, apiPost } from "@/api/client";

const BASE = "/api/data/table/role_permissions";

export type RolePermissionRow = {
  id?: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export async function listRolePermissions(roleFilter?: string): Promise<RolePermissionRow[]> {
  const p = new URLSearchParams({
    select: "*",
    order: "module_name.asc,field_name.asc",
  });
  if (roleFilter) p.set("role", `eq.${roleFilter}`);
  const rows = await apiGet<RolePermissionRow[]>(`${BASE}?${p.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

/** 与权限设置 / 数据字段权限面板历史请求一致：仅按 module_name 排序 */
export async function listRolePermissionsByModuleOrder(): Promise<RolePermissionRow[]> {
  const rows = await apiGet<RolePermissionRow[]>(`${BASE}?select=*&order=module_name.asc`);
  return Array.isArray(rows) ? rows : [];
}

export async function upsertRolePermissions(rows: RolePermissionRow[]): Promise<void> {
  if (rows.length === 0) return;
  await apiPost(BASE, {
    data: rows,
    upsert: true,
    onConflict: "role,module_name,field_name",
  });
}
