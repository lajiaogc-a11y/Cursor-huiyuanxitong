/**
 * 会员登录页「功能徽章」：后台每行一般为「表情 + 空格 + 文案」，如 "🏆 签到奖励"。
 * 无表情前缀时整行作为下方文案，上方图标区为空。
 *
 * 注意：勿在源码中直接使用含 `\p{...}` 的正则字面量——部分 WebKit 会整段脚本解析失败；
 * 统一用 `new RegExp(..., "su")` 包在 try/catch 中构建，失败则回退为「按空白拆分」。
 */

const RE_BADGE_WITH_SPACE = (() => {
  try {
    return new RegExp(
      String.raw`^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)\s+(.+)$`,
      "su",
    );
  } catch {
    return null;
  }
})();

const RE_BADGE_GLUED = (() => {
  try {
    return new RegExp(
      String.raw`^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)(.+)$`,
      "su",
    );
  } catch {
    return null;
  }
})();

const RE_BADGE_ONLY = (() => {
  try {
    return new RegExp(
      String.raw`^(\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*(?:\uFE0F)?)$`,
      "su",
    );
  } catch {
    return null;
  }
})();

function parseMemberLoginBadgeFallback(trimmed: string): { icon: string; label: string } {
  const i = trimmed.search(/\s/);
  if (i > 0) {
    const left = trimmed.slice(0, i).trimEnd();
    const right = trimmed.slice(i).trim();
    if (right) return { icon: left, label: right };
  }
  return { icon: "", label: trimmed };
}

export function parseMemberLoginBadge(line: string): { icon: string; label: string } {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return { icon: "", label: "" };

  try {
    if (RE_BADGE_WITH_SPACE) {
      const withSpace = trimmed.match(RE_BADGE_WITH_SPACE);
      if (withSpace) {
        return { icon: withSpace[1], label: withSpace[2].trim() };
      }
    }

    if (RE_BADGE_GLUED) {
      const glued = trimmed.match(RE_BADGE_GLUED);
      if (glued && glued[2].trim()) {
        return { icon: glued[1], label: glued[2].trim() };
      }
    }

    if (RE_BADGE_ONLY) {
      const onlyEmoji = trimmed.match(RE_BADGE_ONLY);
      if (onlyEmoji) {
        return { icon: onlyEmoji[1], label: "" };
      }
    }
  } catch {
    return parseMemberLoginBadgeFallback(trimmed);
  }

  return parseMemberLoginBadgeFallback(trimmed);
}

export const MEMBER_LOGIN_BADGE_SLOT_COUNT = 6;
