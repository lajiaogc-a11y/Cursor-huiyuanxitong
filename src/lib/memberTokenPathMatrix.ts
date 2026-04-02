/**
 * 会员域 vs 员工域 Bearer 选择规则（与 apiClient.resolveBearerTokenForPath 对齐）。
 * 单一登记处，避免路径判断散落在多处。
 */

/** 仅使用员工 JWT（勿带会员 token，避免平台接口拿到错误主体） */
export function isStaffOnlyAuthPath(path: string): boolean {
  const base = path.split("?")[0] ?? path;
  return base.startsWith("/api/auth/") || base.startsWith("/api/platform/");
}

/** 公开落地页：禁止附带员工 JWT（过期员工 token 会导致 401 → 误判掉线） */
export function isPublicMemberOnboardingPath(path: string): boolean {
  const base = path.split("?")[0] ?? path;
  return (
    path.includes("/member-portal-settings/by-invite-token") ||
    path.includes("/member-portal-settings/by-account") ||
    path.includes("/rpc/validate_invite_and_submit") ||
    base === "/api/member/register-init" ||
    base === "/api/member/register"
  );
}

/** 浏览器当前 SPA 路径：会员界面、邀请落地、会员登录根（「/」与 Hash 模式下 getSpaPathname 一致） */
export function isMemberRealmPathname(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname.startsWith("/member") || pathname.startsWith("/invite")) return true;
  // 子路径部署：如 /app/member/...（避免误判 /staff/member-portal：须为路径段 member 后跟 / 或结尾）
  return /(?:^|\/)member(?:\/|$)/.test(pathname) || /(?:^|\/)invite(?:\/|$)/.test(pathname);
}

/** API 路径本身属于会员 HTTP/RPC 前缀 */
export function isMemberScopedApiPath(path: string): boolean {
  const base = path.split("?")[0] ?? path;
  return (
    path.startsWith("/api/member-auth") ||
    path.startsWith("/api/member-inbox") ||
    path.startsWith("/api/data/rpc/member_") ||
    base.startsWith("/api/invite/") ||
    /** 会员拉门户皮肤/转盘奖品：勿带失效的员工 JWT，否则 authMiddleware 直接 401 */
    base.startsWith("/api/member-portal-settings/by-member/") ||
    base.includes("/api/member-portal-settings/spin-wheel-prizes/by-member/")
  );
}

/**
 * 必须优先会员 JWT（即使当前不在 /member 路由，防止本地同时存双 token 时误带员工 token）
 * 后端已对 POST /api/lottery/draw 校验 requireMemberJwt
 */
export function isMemberTokenFirstApiPath(path: string): boolean {
  const base = path.split("?")[0] ?? path;
  return base === "/api/lottery/draw";
}

/** 是否应优先尝试 member_access_token */
export function shouldPreferMemberToken(path: string, pathname: string): boolean {
  /** 员工后台任意页：默认带员工 JWT；仅显式会员类 API 才优先会员 token（避免双 token 并存时误带会员态） */
  if (pathname.startsWith("/staff/")) {
    return isMemberScopedApiPath(path) || isMemberTokenFirstApiPath(path);
  }
  return (
    isMemberRealmPathname(pathname) ||
    isMemberScopedApiPath(path) ||
    isMemberTokenFirstApiPath(path)
  );
}
