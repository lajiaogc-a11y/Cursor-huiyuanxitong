/**
 * 非 React 上下文中的语言解析：与 LanguageContext 使用同一 localStorage 键。
 *
 * 默认语言为英文（en）。中文仅在 localStorage.appLanguage === "zh" 时启用，
 * 用于内部查看，不对普通用户暴露入口。不根据浏览器语言自动切换。
 */
import { showMemberPortal } from "@/routes/siteMode";

export const APP_LANGUAGE_STORAGE_KEY = "appLanguage";

export type AppLocale = "zh" | "en";

/**
 * 读取存储的语言偏好。
 * 支持通过 URL 查询参数 `?lang=zh` 一次性写入 localStorage 并生效。
 */
export function readStoredAppLocale(): AppLocale {
  try {
    if (typeof localStorage === "undefined") return "en";

    if (typeof window !== "undefined" && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const qLang = params.get("lang");
      if (qLang === "zh" || qLang === "en") {
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, qLang);
        return qLang;
      }
    }

    const v = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

/** 与 LanguageContext.isMemberFacingPath 逻辑保持一致 */
export function isMemberFacingPathname(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;
  if (path === "/member" || path.startsWith("/member/")) return true;
  if (path.startsWith("/invite")) return true;
  if (path === "/" || path === "") return showMemberPortal;
  return false;
}

/** 在浏览器内根据存储偏好得到文案语言（供 toast、store、打印页等使用） */
export function readEffectiveAppLocale(): AppLocale {
  return readStoredAppLocale();
}

export function pickBilingual(zh: string, en: string, locale: AppLocale = readEffectiveAppLocale()): string {
  return locale === "en" ? en : zh;
}
