import type { CleanupTemplate } from "./templateManager";

const STORAGE_KEY = "staff_data_cleanup_templates_v1";

/** 历史清理模板中的模块 id → 当前 canonical id */
const LEGACY_CLEANUP_MODULE_IDS: Record<string, string> = {
  settings_data_management: "data_management",
};

function remapTemplateModuleIds(ids: string[]): string[] {
  const next = ids.map((id) => LEGACY_CLEANUP_MODULE_IDS[id] ?? id);
  return [...new Set(next)];
}

export function loadCleanupTemplatesFromStorage(): CleanupTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.filter((x) => x && typeof (x as CleanupTemplate).id === "string") as CleanupTemplate[];
    return rows.map((tpl) => ({
      ...tpl,
      includeModuleIds: remapTemplateModuleIds(tpl.includeModuleIds ?? []),
      excludeModuleIds: remapTemplateModuleIds(tpl.excludeModuleIds ?? []),
    }));
  } catch {
    return [];
  }
}

export function saveCleanupTemplatesToStorage(templates: CleanupTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    /* ignore quota */
  }
}
