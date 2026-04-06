import type { CleanupModuleDefinition, CleanupModuleResult, CleanupExecuteContext } from "./types";
import { STAFF_NAV_TOP_LEVEL_ITEMS } from "@/staffNavigation/staffNavigationRegistry";

const registry = new Map<string, CleanupModuleDefinition>();

export function registerCleanupModule(def: CleanupModuleDefinition): void {
  registry.set(def.id, def);
}

export function getCleanupModule(id: string): CleanupModuleDefinition | undefined {
  return registry.get(id);
}

export function listCleanupModules(): CleanupModuleDefinition[] {
  return [...registry.values()].sort((a, b) => a.labelZh.localeCompare(b.labelZh, "zh-Hans"));
}

function placeholderExecute(moduleId: string): (ctx: CleanupExecuteContext) => Promise<CleanupModuleResult> {
  return async () => ({
    moduleId,
    status: "skipped",
    message:
      "按模块拆分的清理尚未接入；请使用「批量删除业务数据」对话框执行数据库清理。",
  });
}

/**
 * 根据导航注册表注册占位模块，并注册「数据管理」受保护项。
 * 新导航加入 STAFF_NAV_TOP_LEVEL_ITEMS 后会自动出现（需重新执行 register）。
 */
export function registerDefaultCleanupModulesFromNavigation(): void {
  registry.clear();

  registerCleanupModule({
    id: "data_management",
    navKeys: ["data_management"],
    labelZh: "数据管理（侧栏独立模块）",
    labelEn: "Data Management (staff navigation)",
    participatesInFullClear: false,
    allowDelete: false,
    defaultChecked: false,
    isReservedData: true,
    reservedReasonZh: "默认不参与一键全清；配置与删除入口本身需保留。",
    reservedReasonEn: "Excluded from one-click full clear by default.",
    scopes: ["api"],
    isPlaceholder: true,
    execute: async () => ({
      moduleId: "data_management",
      status: "skipped",
      message: "受保护模块，不执行清理。",
    }),
  });

  for (const item of STAFF_NAV_TOP_LEVEL_ITEMS) {
    if (item.navKey === "data_management") continue;
    const id = `nav:${item.navKey}`;
    if (registry.has(id)) continue;
    registerCleanupModule({
      id,
      navKeys: [item.navKey],
      labelZh: `${item.labelZh}（导航）`,
      labelEn: `${item.labelEn} (nav)`,
      participatesInFullClear: true,
      allowDelete: true,
      defaultChecked: true,
      scopes: ["api"],
      isPlaceholder: true,
      execute: placeholderExecute(id),
    });
  }
}

registerDefaultCleanupModulesFromNavigation();
