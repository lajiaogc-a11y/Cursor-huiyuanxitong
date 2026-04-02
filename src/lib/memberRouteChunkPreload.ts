import { ROUTES } from "@/routes/constants";

/**
 * 与 `routes/lazyPages.tsx` 会员页同源 dynamic import，首进壳层时先预载当前路径 chunk，
 * 与 MemberTabbedShell / Outlet 内 Suspense 共用同一打包文件，避免 Splash 关闭后仍闪骨架屏。
 */
export function preloadMemberRouteChunk(pathname: string): Promise<unknown> {
  switch (pathname) {
    case ROUTES.MEMBER.DASHBOARD:
      return import("@/pages/member/MemberDashboard");
    case ROUTES.MEMBER.POINTS:
      return import("@/pages/member/MemberPoints");
    case ROUTES.MEMBER.SPIN:
      return import("@/pages/member/MemberSpin");
    case ROUTES.MEMBER.INVITE:
      return import("@/pages/member/MemberInvite");
    case ROUTES.MEMBER.SETTINGS:
      return import("@/pages/member/MemberSettings");
    case ROUTES.MEMBER.FIRST_PASSWORD:
      return import("@/pages/member/MemberFirstPassword");
    case ROUTES.MEMBER.WALLET:
      return import("@/pages/member/MemberWallet");
    case ROUTES.MEMBER.ORDERS:
      return import("@/pages/member/MemberOrders");
    case ROUTES.MEMBER.TRADE_CONTACT:
      return import("@/pages/member/MemberTradeContact");
    case ROUTES.MEMBER.NOTIFICATIONS:
      return import("@/pages/member/MemberNotifications");
    case ROUTES.MEMBER.ONBOARDING:
      return import("@/pages/member/MemberOnboarding");
    default:
      return Promise.resolve();
  }
}
