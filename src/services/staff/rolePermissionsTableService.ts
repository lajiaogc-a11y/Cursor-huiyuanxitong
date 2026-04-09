/**
 * role_permissions 表代理：导入/导出
 */
import { listRolePermissionsData, upsertRolePermissionsData } from "@/api/rolePermissionData";
import type { RolePermissionRow } from "@/api/rolePermissionData";

export async function listRolePermissions(roleFilter?: string): Promise<RolePermissionRow[]> {
  const p = new URLSearchParams({
    select: "*",
    order: "module_name.asc,field_name.asc",
  });
  if (roleFilter) p.set("role", `eq.${roleFilter}`);
  const rows = await listRolePermissionsData(p.toString());
  return Array.isArray(rows) ? rows : [];
}

/** 与权限设置 / 数据字段权限面板历史请求一致：仅按 module_name 排序 */
export async function listRolePermissionsByModuleOrder(): Promise<RolePermissionRow[]> {
  const rows = await listRolePermissionsData("select=*&order=module_name.asc");
  return Array.isArray(rows) ? rows : [];
}

export async function upsertRolePermissions(rows: RolePermissionRow[]): Promise<void> {
  if (rows.length === 0) return;
  await upsertRolePermissionsData(rows);
}
