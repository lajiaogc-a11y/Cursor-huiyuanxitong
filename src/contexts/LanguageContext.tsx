import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations, TranslationKey } from '@/locales/translations';

export type Language = 'zh' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (zhText: string, enText: string) => string;
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

  // Simple inline translation helper
  const t = (zhText: string, enText: string): string => {
    return language === 'zh' ? zhText : enText;
  };

  // Translation key lookup helper
  const tr = (key: string): string => {
    const keys = key.split('.');
    let value: any = translations;
    
    for (const k of keys) {
      value = value?.[k];
      if (!value) return key;
    }
    
    return value?.[language] || key;
  };

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
