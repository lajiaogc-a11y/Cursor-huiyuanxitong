import type { Member } from "@/hooks/useMembers";

/**
 * 与会员端设置页（MemberSettings）展示一致：昵称优先，否则会员编号、电话。
 * members 表 nickname 由会员在门户修改后同步。
 */
export function getMemberPortalDisplayName(member: Pick<Member, "nickname" | "memberCode" | "phoneNumber">): string {
  const nick = member.nickname?.trim();
  if (nick) return nick;
  return member.memberCode || member.phoneNumber || "";
}
