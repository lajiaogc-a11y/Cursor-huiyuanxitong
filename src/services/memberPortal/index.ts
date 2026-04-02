/**
 * 会员门户业务门面统一出口（页面优先从子模块或本文件 import，避免散落硬编码 URL）
 * 认证与完整 RPC 仍见 memberAuthService / memberActivityService。
 */
export * from "./routes";
export * from "./memberLotteryPageService";
export * from "./memberPointsPortalService";
export * from "./memberInvitePortalService";
export * from "./memberDailyTasksPortalService";
export { memberGetInfo, type MemberInfo } from "./memberProfilePortalService";
