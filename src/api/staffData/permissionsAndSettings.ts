import { apiClient } from "@/lib/apiClient";

export interface RolePermissionRow {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export async function getRolePermissions(): Promise<RolePermissionRow[]> {
  const res = await apiClient.get<RolePermissionRow[] | { data?: RolePermissionRow[] }>("/api/data/permissions");
  const arr = Array.isArray(res) ? res : (res as { data?: RolePermissionRow[] })?.data ?? [];
  return Array.isArray(arr) ? arr : [];
}

export async function saveRolePermissions(
  role: string,
  permissions: Array<{
    module_name: string;
    field_name: string;
    can_view?: boolean;
    can_edit?: boolean;
    can_delete?: boolean;
  }>,
): Promise<void> {
  await apiClient.post("/api/data/permissions", { role, permissions });
}

/** 与后端 normalizeIpAccessControl 一致（含国家/地区登录策略） */
export interface IpAccessControlNormalized {
  enabled: boolean;
  mode: "whitelist" | "blacklist";
  rules: Array<{ ip: string; label?: string }>;
  /** 为 true 时内网/回环也受 IP 名单约束，并与租户员工登录白名单对齐 */
  enforce_private_lan: boolean;
  country_restrict_login: boolean;
  country_mode: "allow" | "block";
  country_codes: string[];
}

export async function getIpAccessControlConfig(): Promise<IpAccessControlNormalized> {
  try {
    return await apiClient.get<IpAccessControlNormalized>("/api/data/settings/ip-access-control");
  } catch {
    return {
      enabled: false,
      mode: "whitelist",
      rules: [],
      enforce_private_lan: false,
      country_restrict_login: false,
      country_mode: "block",
      country_codes: [],
    };
  }
}

export async function upsertDataSetting(
  settingKey: string,
  settingValue: unknown,
): Promise<void> {
  await apiClient.post("/api/data/table/data_settings", {
    data: {
      setting_key: settingKey,
      setting_value: settingValue,
      updated_at: new Date().toISOString(),
    },
    upsert: true,
    onConflict: "setting_key",
  });
}
