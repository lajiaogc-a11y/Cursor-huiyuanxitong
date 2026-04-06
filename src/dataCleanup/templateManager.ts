import { loadCleanupTemplatesFromStorage, saveCleanupTemplatesToStorage } from "./cleanupTemplatesStorage";
import { listCleanupModules } from "./cleanupModuleRegistry";

export type CleanupTemplate = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 模板包含的模块 id（未知 id 在使用时过滤） */
  includeModuleIds: string[];
  /** 显式排除（从 include 或全量意图中扣除） */
  excludeModuleIds: string[];
};

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function listTemplates(): CleanupTemplate[] {
  return loadCleanupTemplatesFromStorage().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveTemplate(input: Omit<CleanupTemplate, "id" | "createdAt" | "updatedAt"> & { id?: string }): CleanupTemplate {
  const now = Date.now();
  const all = loadCleanupTemplatesFromStorage();
  const id = input.id ?? uid();
  const existing = all.find((t) => t.id === id);
  const row: CleanupTemplate = {
    id,
    name: input.name.trim() || "未命名模板",
    includeModuleIds: [...new Set(input.includeModuleIds)],
    excludeModuleIds: [...new Set(input.excludeModuleIds)],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = existing ? all.map((t) => (t.id === id ? row : t)) : [...all, row];
  saveCleanupTemplatesToStorage(next);
  return row;
}

export function deleteTemplate(id: string): void {
  const next = loadCleanupTemplatesFromStorage().filter((t) => t.id !== id);
  saveCleanupTemplatesToStorage(next);
}

/** 将模板解析为本次应执行/勾选的模块 id（过滤已不存在的模块） */
export function resolveTemplateModuleIds(template: CleanupTemplate): string[] {
  const valid = new Set(listCleanupModules().map((m) => m.id));
  const include = template.includeModuleIds.filter((id) => valid.has(id));
  const exclude = new Set(template.excludeModuleIds.filter((id) => valid.has(id)));
  return include.filter((id) => !exclude.has(id));
}

/** 当前所有「可参与全清」且非占位执行依赖的模块 id — 用于模板保存「当前勾选」 */
export function allParticipatingModuleIds(): string[] {
  return listCleanupModules()
    .filter((m) => m.participatesInFullClear && m.allowDelete)
    .map((m) => m.id);
}
