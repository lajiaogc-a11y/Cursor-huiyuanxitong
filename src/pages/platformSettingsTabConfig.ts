export const SETTINGS_TABS = [
  { key: "ip-control", zh: "IP访问控制", en: "IP Access Control" },
  { key: "system-health", zh: "系统健康", en: "System Health" },
  { key: "resource-monitor", zh: "资源监控", en: "Resource Monitor" },
  { key: "risk-dashboard", zh: "风险评分", en: "Risk Scoring" },
  { key: "data-archive", zh: "数据归档", en: "Data Archive" },
  { key: "data-backup", zh: "数据备份", en: "Data Backup" },
  { key: "data-repair", zh: "数据修复", en: "Data Repair" },
  { key: "operation-logs", zh: "操作日志", en: "Operation Logs" },
  { key: "login-logs", zh: "登录日志", en: "Login Logs" },
  { key: "feature-flags", zh: "功能开关", en: "Feature Flags" },
  { key: "maintenance-mode", zh: "维护模式", en: "Maintenance Mode" },
  { key: "announcements", zh: "公告/站内信", en: "Announcements" },
  { key: "login-2fa", zh: "登录2FA", en: "Login 2FA" },
  { key: "tenant-quota", zh: "租户配额", en: "Tenant Quota" },
  { key: "data-migration-tools", zh: "数据迁移工具", en: "Data Migration Tools" },
  { key: "open-api", zh: "开放 API", en: "Open API" },
  { key: "device-whitelist", zh: "设备白名单登录", en: "Device whitelist login" },
] as const;

export function getPlatformSettingsSubTabTitle(tabKey: string): { zh: string; en: string } | undefined {
  const item = SETTINGS_TABS.find((x) => x.key === tabKey);
  return item ? { zh: item.zh, en: item.en } : undefined;
}
