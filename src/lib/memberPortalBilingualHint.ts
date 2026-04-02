/** 会员门户后台「中/英」配置在会员端的选用规则（避免英文界面误显示中文文案） */

export type MemberPortalLang = "zh" | "en";

/** 首页积分弹窗底部说明 */
export function resolveHomePointsBalanceFooter(
  language: MemberPortalLang,
  homeZh: string,
  homeEn: string,
  fallbackZh: string,
  fallbackEn: string,
): string {
  const z = String(homeZh ?? "").trim();
  let e = String(homeEn ?? "").trim();
  if (language === "zh") return z || e || fallbackZh;
  if (e && enFieldLooksMisassignedToChinese(e)) e = "";
  return e || fallbackEn;
}

/** 英文界面：管理员误把中文填进「英文」字段时，若无明显英文词则不用该值 */
function enFieldLooksMisassignedToChinese(en: string): boolean {
  if (!en) return false;
  const hasHan = /[\u4e00-\u9fff]/.test(en);
  if (!hasHan) return false;
  return !/[a-zA-Z]{3,}/.test(en);
}

/**
 * 后台成对的中英文字段（如规则标题）：按界面语言选用，英文界面不回退中文。
 */
export function pickBilingualPortalField(
  language: MemberPortalLang,
  zhVal: string | undefined,
  enVal: string | undefined,
  fallbackZh: string,
  fallbackEn: string,
): string {
  const z = String(zhVal ?? "").trim();
  let e = String(enVal ?? "").trim();
  if (language === "zh") return z || e || fallbackZh;
  if (e && enFieldLooksMisassignedToChinese(e)) e = "";
  return e || fallbackEn;
}
