import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import {
  readInitialAppTheme,
  persistAppTheme,
  applyThemeClassToDocument,
  applyThemeClassToDocumentWithMemberTransition,
  applyThemeColorMeta,
  type AppTheme,
} from '@/lib/appTheme';

type Theme = AppTheme;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 与 public/theme-init.js 同步：首帧即最终主题，不在 mount 后再改 documentElement
  const [theme, setThemeState] = useState<Theme>(() => readInitialAppTheme());

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    persistAppTheme(newTheme);
    applyThemeClassToDocument(newTheme);
    applyThemeColorMeta(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: AppTheme = prev === 'light' ? 'dark' : 'light';
      persistAppTheme(next);
      applyThemeClassToDocumentWithMemberTransition(next);
      applyThemeColorMeta(next);
      return next;
    });
  }, []);

  const themeValue = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
