/**
 * 会员门户 — HTTP / RPC 路径唯一登记
 * 业务层请从此文件引用路径，避免页面与多处 service 硬编码分散。
 */
export const MEMBER_AUTH_PATHS = {
  SIGNIN: "/api/member-auth/signin",
  SET_PASSWORD: "/api/member-auth/set-password",
  info: (memberId: string) =>
    `/api/member-auth/info?member_id=${encodeURIComponent(memberId)}`,
} as const;

/** 抽奖 REST（与 MemberSpin / useMemberSpinQuota 一致） */
export const MEMBER_LOTTERY_PATHS = {
  DRAW: "/api/lottery/draw",
  quota: (memberId: string) => `/api/lottery/quota/${encodeURIComponent(memberId)}`,
  logs: (memberId: string, limit: number, offset = 0) =>
    `/api/lottery/logs/${encodeURIComponent(memberId)}?limit=${limit}&offset=${offset}`,
  prizes: (memberId: string) => `/api/lottery/prizes/${encodeURIComponent(memberId)}`,
  /** 假人中奖氛围条（轮询） */
  SIM_FEED: "/api/lottery/sim-feed",
} as const;

/** 会员积分 REST（员工 JWT 路径） */
export const MEMBER_POINTS_HTTP_PATHS = {
  member: (memberId: string) => `/api/points/member/${encodeURIComponent(memberId)}`,
  breakdown: (memberId: string) =>
    `/api/points/member/${encodeURIComponent(memberId)}/breakdown`,
  spinQuota: (memberId: string) =>
    `/api/points/member/${encodeURIComponent(memberId)}/spin-quota`,
} as const;

/** 会员门户 data/rpc */
export const MEMBER_PORTAL_RPC_PATHS = {
  MEMBER_CHECK_IN_TODAY: "/api/data/rpc/member_check_in_today",
  MEMBER_CHECK_IN: "/api/data/rpc/member_check_in",
  MEMBER_GRANT_SPIN_FOR_SHARE: "/api/data/rpc/member_grant_spin_for_share",
  MEMBER_GET_INVITE_TOKEN: "/api/data/rpc/member_get_invite_token",
  MEMBER_GET_ORDERS: "/api/data/rpc/member_get_orders",
  MEMBER_UPDATE_NICKNAME: "/api/data/rpc/member_update_nickname",
  MEMBER_UPDATE_AVATAR: "/api/data/rpc/member_update_avatar",
  VALIDATE_INVITE_AND_SUBMIT: "/api/data/rpc/validate_invite_and_submit",
  /** 邀请注册（推荐）：须先 init 再提交，见 server/docs/INVITE-REGISTER.md */
  MEMBER_REGISTER_INIT: "/api/member/register-init",
  MEMBER_REGISTER: "/api/member/register",
  MEMBER_GET_POINTS: "/api/data/rpc/member_get_points",
  MEMBER_GET_POINTS_BREAKDOWN: "/api/data/rpc/member_get_points_breakdown",
  MEMBER_LIST_POINTS_LEDGER: "/api/data/rpc/member_list_points_ledger",
  MEMBER_GET_SPIN_QUOTA: "/api/data/rpc/member_get_spin_quota",
} as const;
