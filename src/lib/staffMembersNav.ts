/** 会员后台「会员管理」侧栏子项 path 与当前路由对齐（含无 tab、独立会员列表页） */

const MEMBER_HUB_TABS = new Set(["members", "activity", "gifts", "points"]);

/**
 * 将当前 location 规范为与侧栏子项一致的完整 path（pathname + search）。
 * 非会员中心相关路由返回 null。
 */
export function canonicalStaffMembersNavPath(pathname: string, search: string): string | null {
  if (pathname === "/staff/member-management") {
    return "/staff/members?tab=members";
  }
  if (pathname !== "/staff/members") {
    return null;
  }
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const tab = params.get("tab");
  if (tab == null || tab === "" || tab === "members" || !MEMBER_HUB_TABS.has(tab)) {
    return "/staff/members?tab=members";
  }
  return `/staff/members?tab=${tab}`;
}
