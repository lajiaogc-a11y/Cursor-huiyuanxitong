import { ROUTES } from "@/routes/constants";

const STORAGE_KEY = "memberPortal.inviteFromPointsHash";

const ALLOWED_POINT_HASHES = new Set([
  "",
  "#member-rewards-marketplace",
  "#member-recommended-heading",
  "#member-points-earn-hub",
  "#member-points-orders",
  "#member-points-activity",
]);

/**
 * 在跳转到 /member/invite 之前调用。
 * - 若当前在积分页：写入当时的 hash（空字符串表示页顶无锚点）。
 * - 若从其它页进入邀请：清除记录，邀请页主按钮走默认「进礼遇商城」。
 */
export function stashPointsHashBeforeInviteNavigation(pathname: string, hash: string): void {
  try {
    if (pathname === ROUTES.MEMBER.POINTS) {
      sessionStorage.setItem(STORAGE_KEY, hash || "");
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* private mode / quota */
  }
}

/** 是否曾在本次会话中从积分页带上下文进入邀请（用于主按钮文案）。 */
export function hasInviteReturnFromPointsSession(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 邀请页主按钮目标：有积分页上下文时回到同一 hash；否则默认进礼遇商城区块。
 */
export function readInviteReturnPointsPath(): string {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return `${ROUTES.MEMBER.POINTS}#member-rewards-marketplace`;
    }
    const normalized = raw.startsWith("#") || raw === "" ? raw : `#${raw}`;
    if (normalized !== "" && !ALLOWED_POINT_HASHES.has(normalized)) {
      return ROUTES.MEMBER.POINTS;
    }
    return `${ROUTES.MEMBER.POINTS}${normalized}`;
  } catch {
    return `${ROUTES.MEMBER.POINTS}#member-rewards-marketplace`;
  }
}
