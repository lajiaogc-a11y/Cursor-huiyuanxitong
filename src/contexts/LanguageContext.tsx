import { createContext, useContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { translations } from '@/locales/translations';
import { repairUtf8MisdecodedAsLatin1 } from '@/lib/utf8MojibakeRepair';
import { showMemberPortal } from '@/routes/siteMode';

/** 统一修复源码/API 中偶发的 UTF-8 被按 Latin-1 存储导致的乱码 */
function fixMojibakeUi(s: string): string {
  if (!s) return s;
  return repairUtf8MisdecodedAsLatin1(s);
}

export type Language = 'zh' | 'en';

const STORAGE_KEY = "appLanguage";

function readStoredLanguage(): Language {
  try {
    if (typeof localStorage === "undefined") return "zh";
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "zh";
}

/** 会员端界面固定英文；员工端与其它公共页使用用户偏好语言 */
function isMemberFacingPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).split("#")[0] ?? pathname;
  // 勿用 path.startsWith("/member")：会误把 /member-portal 等员工配置页当成会员域
  if (path === "/member" || path.startsWith("/member/")) return true;
  if (path.startsWith("/invite")) return true;
  if (path === "/" || path === "") return showMemberPortal;
  return false;
}

interface LanguageContextType {
  /** 当前实际用于文案的语言（会员端恒为 en） */
  language: Language;
  /** 用户保存的偏好（员工端生效） */
  preferredLanguage: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: {
    (zhText: string, enText: string): string;
    (key: string): string;
  };
  tr: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function resolveByKey(key: string, lang: Language): string {
  if (!key) return "";
  const keys = key.split(".");
  let value: unknown = translations;

  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
    if (value == null) return fixMojibakeUi(key);
  }

  if (typeof value === "object" && value !== null && "en" in (value as object)) {
    const row = value as { en?: unknown; zh?: unknown };
    const resolved = lang === "zh" ? (row.zh ?? row.en) : (row.en ?? row.zh);
    if (resolved == null || resolved === "") return fixMojibakeUi(key);
    return fixMojibakeUi(String(resolved));
  }

  return fixMojibakeUi(key);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [preferredLanguage, setPreferredLanguageState] = useState<Language>(readStoredLanguage);

  const memberFacing = isMemberFacingPath(pathname);
  const effectiveLanguage: Language = memberFacing ? "en" : preferredLanguage;

  useEffect(() => {
    document.documentElement.lang = effectiveLanguage === "zh" ? "zh-CN" : "en";
  }, [effectiveLanguage]);

  const setLanguage = useCallback((lang: Language) => {
    setPreferredLanguageState(lang);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, lang);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(preferredLanguage === "zh" ? "en" : "zh");
  }, [preferredLanguage, setLanguage]);

  const t = useCallback<LanguageContextType["t"]>(
    (arg1: string, arg2?: string): string => {
      if (typeof arg2 === "string") {
        const s = effectiveLanguage === "zh" ? arg1 : arg2;
        return fixMojibakeUi(s);
      }
      return resolveByKey(arg1, effectiveLanguage);
    },
    [effectiveLanguage],
  );

  const tr = useCallback<LanguageContextType["tr"]>((key: string) => t(key), [t]);

  const value = useMemo(
    () => ({
      language: effectiveLanguage,
      preferredLanguage,
      setLanguage,
      toggleLanguage,
      t,
      tr,
    }),
    [effectiveLanguage, preferredLanguage, setLanguage, toggleLanguage, t, tr],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
