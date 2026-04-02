/** 纯 UI 偏好（深色/浅色）；须与 public/theme-init.js 保持一致 */
export const APP_THEME_STORAGE_KEY = "appTheme";

export type AppTheme = "light" | "dark";

/**
 * 同步读取主题（首屏与 ThemeProvider 初值共用）。
 * 默认深色；仅当明确存了 light 时为浅色。
 */
export function readInitialAppTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const s = localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (s === "light") return "light";
    if (s === "dark") return "dark";
    return "dark";
  } catch {
    return "dark";
  }
}

export function persistAppTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function applyThemeClassToDocument(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** 会员端深浅切换时的短暂过渡类（与 member-portal.css 中 html.member-html.member-theme-toggling 配套） */
export function applyThemeClassToDocumentWithMemberTransition(theme: AppTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.add("member-theme-toggling");
  window.setTimeout(() => root.classList.remove("member-theme-toggling"), 560);
}

/**
 * 与 index.html 内联首屏色、.dark / :root 背景一致，供 PWA 顶栏。
 * public/theme-init.js 内联的十六进制须与此相同（CSP 下无法共用模块）。
 */
const THEME_COLOR_DARK = "#161922";
const THEME_COLOR_LIGHT = "#f4f7fa";

export function applyThemeColorMeta(theme: AppTheme): void {
  const el = document.querySelector('meta[name="theme-color"]');
  if (!el) return;
  el.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}
