/**
 * i18n Convention:
 *
 * - Use `t('key')` for keys defined in the translations dictionary below.
 * - Use `t("中文默认文字", "English fallback")` for one-off strings not in the dictionary.
 * - NEVER use `t('key')` for a key that doesn't exist in TRANSLATIONS — it will display the raw key.
 * - For new strings: prefer `t("中文", "English")` unless the string appears in 3+ places,
 *   in which case add it to TRANSLATIONS and use `t('key')`.
 *
 * Language strategy:
 * - Default language is English for all routes (member-facing and staff).
 * - Chinese is a hidden internal mode activated only via localStorage.appLanguage = "zh"
 *   or by visiting any page with ?lang=zh in the URL.
 * - No automatic browser language detection.
 */
import { createContext, useContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { translations } from '@/locales/translations';
import { repairUtf8MisdecodedAsLatin1 } from '@/lib/utf8MojibakeRepair';
import { APP_LANGUAGE_STORAGE_KEY, readStoredAppLocale } from '@/lib/appLocale';

/** 统一修复源码/API 中偶发的 UTF-8 被按 Latin-1 存储导致的乱码 */
function fixMojibakeUi(s: string): string {
  if (!s) return s;
  return repairUtf8MisdecodedAsLatin1(s);
}

export type Language = 'zh' | 'en';

interface LanguageContextType {
  /** 当前实际用于文案的语言 */
  language: Language;
  /** 用户保存的偏好 */
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
  const [preferredLanguage, setPreferredLanguageState] = useState<Language>(readStoredAppLocale);

  const effectiveLanguage: Language = preferredLanguage;

  useEffect(() => {
    document.documentElement.lang = effectiveLanguage === "zh" ? "zh-CN" : "en";
  }, [effectiveLanguage]);

  const setLanguage = useCallback((lang: Language) => {
    setPreferredLanguageState(lang);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, lang);
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
