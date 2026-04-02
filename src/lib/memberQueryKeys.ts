/**
 * 会员端（/member/*）React Query 缓存键统一前缀为 ['member', ...]，
 * 与员工端 ['members', tenantId] 区分，便于 signOut / 401 时精准清理。
 */
export const memberQueryKeys = {
  /** 匹配所有会员端 query（removeQueries 用） */
  all: ["member"] as const,
  orders: (memberId: string) => ["member", "orders", memberId] as const,
  points: (memberId: string) => ["member", "points", memberId] as const,
  mall: (memberId: string) => ["member", "mall", memberId] as const,
  profile: (memberId: string) => ["member", "profile", memberId] as const,
  portal: (memberId: string) => ["member", "portal", memberId] as const,
  spin: (memberId: string) => ["member", "spin", memberId] as const,
  /** 首页积分构成（消费/推广拆分） */
  pointsBreakdown: (memberId: string) => ["member", "pointsBreakdown", memberId] as const,
  /** 设置页：积分流水（按类型） */
  pointsLedger: (memberId: string, category: "all" | "consumption" | "referral" | "lottery") =>
    ["member", "pointsLedger", memberId, category] as const,
} as const;
