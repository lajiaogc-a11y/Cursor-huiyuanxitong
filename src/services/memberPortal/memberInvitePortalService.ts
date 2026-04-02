/**
 * 会员邀请链接 — 获取 token、拼链接（文案仍由页面用 portal settings 组装）
 */
export { fetchMemberInviteToken } from "./memberActivityService";

export function buildMemberInvitePageUrl(origin: string, tokenOrFallback: string): string {
  const seg = String(tokenOrFallback || "").trim();
  if (!seg) return "";
  return `${origin.replace(/\/+$/, "")}/invite/${seg}`;
}
