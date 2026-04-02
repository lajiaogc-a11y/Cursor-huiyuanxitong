import { ROUTES } from "@/routes/constants";

/** 底部导航五页：与 MemberBottomNav 一致（顺序即 DOM 挂载顺序） */
export const MEMBER_BOTTOM_TAB_PATHS = [
  ROUTES.MEMBER.DASHBOARD,
  ROUTES.MEMBER.POINTS,
  ROUTES.MEMBER.SPIN,
  ROUTES.MEMBER.INVITE,
  ROUTES.MEMBER.SETTINGS,
] as const;

export type MemberBottomTabPath = (typeof MEMBER_BOTTOM_TAB_PATHS)[number];

const TAB_SET = new Set<string>(MEMBER_BOTTOM_TAB_PATHS);

export function isMemberBottomTabPath(pathname: string): boolean {
  return TAB_SET.has(pathname);
}
