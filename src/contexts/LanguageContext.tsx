import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations, TranslationKey } from '@/locales/translations';

export type Language = 'zh' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: {
    (zhText: string, enText: string): string;
    (key: string): string;
  };
  tr: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('appLanguage') as Language;
    return saved === 'zh' || saved === 'en' ? saved : 'zh';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  // Unified key resolver shared by both t()/tr()
  const resolveByKey = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations;
    
    for (const k of keys) {
      value = value?.[k];
      if (!value) return key;
    }
    
    return value?.[language] || key;
  };

  // Unified translator:
  // - t(zh, en): inline text mode
  // - t('module.key'): dictionary key mode
  const t: LanguageContextType['t'] = (arg1: string, arg2?: string): string => {
    if (typeof arg2 === 'string') {
      return language === 'zh' ? arg1 : arg2;
    }
    return resolveByKey(arg1);
  };

  // Keep tr() for backward compatibility, but route to same translator core
  const tr: LanguageContextType['tr'] = (key: string): string => t(key);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, tr }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
