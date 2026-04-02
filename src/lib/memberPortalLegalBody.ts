import type { Language } from "@/contexts/LanguageContext";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

/** 会员端法律正文：按当前界面语言取 zh/en 字段 */
export function memberPortalLegalBody(
  settings: MemberPortalSettings | null | undefined,
  language: Language,
  doc: "terms" | "privacy",
): string {
  if (!settings) return "";
  if (doc === "terms") {
    return language === "zh" ? settings.terms_of_service_zh : settings.terms_of_service_en;
  }
  return language === "zh" ? settings.privacy_policy_zh : settings.privacy_policy_en;
}
