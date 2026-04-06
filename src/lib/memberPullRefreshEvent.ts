/** 会员端下拉刷新完成（及前台恢复 / 全局 safe 刷新后派发），与 PullToRefresh / useMemberPullRefreshSignal 共用 */
export const MEMBER_PULL_REFRESH_EVENT = "member:pull-refresh";

/** 请求执行与 `safeMemberGlobalRefresh`（memberSafeRefresh.ts）相同的节流刷新 */
export const MEMBER_GLOBAL_REFRESH_REQUEST_EVENT = "member:global-refresh-request";
