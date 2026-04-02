/** 汇率页「工作任务」等与分配任务列表同步刷新（SPA 内不卸载时仅靠 useEffect 依赖不会重拉） */
export const WORK_TASKS_REFRESH_EVENT = "gc:work-tasks-refresh";
const STALE_SESSION_KEY = "gc:work-tasks-needs-refresh";

export function dispatchWorkTasksRefresh(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STALE_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(WORK_TASKS_REFRESH_EVENT));
}

/** 汇率页工作任务面板挂载时调用：若曾在其它页发布过任务，则返回 true 并清除标记 */
export function consumeWorkTasksStaleSessionFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(STALE_SESSION_KEY) === "1") {
      sessionStorage.removeItem(STALE_SESSION_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
