/**
 * 会员首页每日任务 — 签到、分享领奖状态与 RPC（供 hooks 统一引用）
 */
export {
  fetchMemberDailyStatus,
  memberCheckIn,
  memberClaimShareReward,
  requestShareNonce,
  type MemberDailyStatus,
  type MemberCheckInResult,
  type ShareRewardResult,
} from "./memberActivityService";
