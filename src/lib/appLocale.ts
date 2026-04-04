/**
 * 非 React 上下文中的语言解析：与 LanguageContext 使用同一 localStorage 键，
 * 并结合路径判断会员域（会员端界面固定英文，与 Provider 内 effectiveLanguage 一致）。
 */
import { showMemberPortal } from "@/routes/siteMode";

export const APP_LANGUAGE_STORAGE_KEY = "appLanguage";

export type AppLocale = "zh" | "en";

export function readStoredAppLocale(): AppLocale {
  try {
    if (typeof localStorage === "undefined") return "zh";
    const v = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "zh";
}

/** 与 LanguageContext.isMemberFacingPath 逻辑保持一致 */
export function isMemberFacingPathname(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;
  if (path === "/member" || path.startsWith("/member/")) return true;
  if (path.startsWith("/invite")) return true;
  if (path === "/" || path === "") return showMemberPortal;
  return false;
}

/** 在浏览器内根据当前 URL 与存储偏好得到文案语言（供 toast、store、打印页等使用） */
export function readEffectiveAppLocale(): AppLocale {
  if (typeof window === "undefined") return readStoredAppLocale();
  if (isMemberFacingPathname(window.location.pathname)) {
    try {
      if (navigator.language?.startsWith("zh")) return "zh";
    } catch { /* non-browser */ }
    return "en";
  }
  return readStoredAppLocale();
}

export function pickBilingual(zh: string, en: string, locale: AppLocale = readEffectiveAppLocale()): string {
  return locale === "en" ? en : zh;
}
