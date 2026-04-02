/**
 * 会员登录页「功能徽章」：后台每行一般为「表情 + 空格 + 文案」，如 "🏆 签到奖励"。
 * 无表情前缀时整行作为下方文案，上方图标区为空。
 */
export function parseMemberLoginBadge(line: string): { icon: string; label: string } {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return { icon: "", label: "" };

  const withSpace = trimmed.match(
    /^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)\s+(.+)$/su,
  );
  if (withSpace) {
    return { icon: withSpace[1], label: withSpace[2].trim() };
  }

  const glued = trimmed.match(
    /^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)(.+)$/su,
  );
  if (glued && glued[2].trim()) {
    return { icon: glued[1], label: glued[2].trim() };
  }

  const onlyEmoji = trimmed.match(
    /^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)$/su,
  );
  if (onlyEmoji) {
    return { icon: onlyEmoji[1], label: "" };
  }

  return { icon: "", label: trimmed };
}

export const MEMBER_LOGIN_BADGE_SLOT_COUNT = 6;
