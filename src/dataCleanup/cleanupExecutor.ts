import type { CleanupExecuteContext, CleanupModuleResult, CleanupRunSummary } from "./types";
import { getCleanupModule } from "./cleanupModuleRegistry";

/**
 * 顺序执行多个清理模块；单模块失败不中断后续模块。
 */
export async function runCleanupModules(
  moduleIds: string[],
  ctx: CleanupExecuteContext = {},
): Promise<CleanupRunSummary> {
  const success: CleanupModuleResult[] = [];
  const skipped: CleanupModuleResult[] = [];
  const failed: CleanupModuleResult[] = [];

  const seen = new Set<string>();
  for (const id of moduleIds) {
    if (seen.has(id)) continue;
    seen.add(id);

    const mod = getCleanupModule(id);
    if (!mod) {
      skipped.push({
        moduleId: id,
        status: "skipped",
        message: "未知模块 id（可能已重命名），已忽略。",
      });
      continue;
    }

    if (!mod.execute) {
      skipped.push({
        moduleId: id,
        status: "skipped",
        message: "未配置 execute",
      });
      continue;
    }

    try {
      const r = await mod.execute(ctx);
      if (r.status === "success") success.push(r);
      else if (r.status === "skipped") skipped.push(r);
      else failed.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({
        moduleId: id,
        status: "failed",
        message: msg,
      });
    }
  }

  return { success, skipped, failed };
}
