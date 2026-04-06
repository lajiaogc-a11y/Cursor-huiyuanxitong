import type { QueryClient } from "@tanstack/react-query";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { MEMBER_PULL_REFRESH_EVENT } from "@/lib/memberPullRefreshEvent";

/** 会员域全局刷新节流窗口（毫秒）：前台恢复 / 下拉 / 原生 PTR / 手动事件共用 */
export const MEMBER_GLOBAL_REFRESH_THROTTLE_MS = 2000;

let lastMemberGlobalRefreshAt = 0;

/**
 * 会员域统一刷新：对 `['member']` 下 active 查询执行 refetch，并派发 `MEMBER_PULL_REFRESH_EVENT`（驱动 refreshMember 等）。
 * 2 秒内多次触发只执行一次，避免 Network 重复与 UI 连闪。
 *
 * @returns 本次是否实际执行了 refetch（`false` 表示被节流跳过）
 */
export function safeMemberGlobalRefresh(queryClient: QueryClient): Promise<boolean> {
  const now = Date.now();
  if (now - lastMemberGlobalRefreshAt < MEMBER_GLOBAL_REFRESH_THROTTLE_MS) {
    return Promise.resolve(false);
  }
  lastMemberGlobalRefreshAt = now;

  return queryClient
    .refetchQueries({
      queryKey: memberQueryKeys.all,
      type: "active",
    })
    .then(() => {
      window.dispatchEvent(new CustomEvent(MEMBER_PULL_REFRESH_EVENT));
      return true;
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent(MEMBER_PULL_REFRESH_EVENT));
      return true;
    });
}
