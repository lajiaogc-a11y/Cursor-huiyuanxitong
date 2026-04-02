/** 预拉取员工端「会员系统」大页面 chunk，减轻首次点击侧栏时的白屏等待 */
export function prefetchStaffMemberPortalPage(): void {
  void import("@/pages/MemberPortalSettings");
}

export const STAFF_MEMBER_PORTAL_PATH = "/staff/member-portal";
