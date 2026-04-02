import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

type LayoutMode = 'fullWidth' | 'centered';

interface LayoutContextType {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  tabletSidebarOpen: boolean;
  setTabletSidebarOpen: (open: boolean) => void;
  toggleTabletSidebar: () => void;
  /**
   * 保持左侧导航在不同页面之间的滚动位置，避免每次切换路由后回到顶部
   */
  navScrollTop: number;
  setNavScrollTop: (top: number) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('fullWidth');
  const [tabletSidebarOpen, setTabletSidebarOpen] = useState(false);
  const [navScrollTop, setNavScrollTop] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('appLayoutMode') as LayoutMode;
    if (saved === 'fullWidth' || saved === 'centered') {
      setLayoutModeState(saved);
    }
  }, []);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeState(mode);
    localStorage.setItem('appLayoutMode', mode);
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setLayoutModeState((prev) => {
      const next = prev === 'fullWidth' ? 'centered' : 'fullWidth';
      localStorage.setItem('appLayoutMode', next);
      return next;
    });
  }, []);

  const toggleTabletSidebar = useCallback(() => {
    setTabletSidebarOpen((prev) => !prev);
  }, []);

  const layoutValue = useMemo(
    () => ({
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
      tabletSidebarOpen,
      setTabletSidebarOpen,
      toggleTabletSidebar,
      navScrollTop,
      setNavScrollTop,
    }),
    [
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
      tabletSidebarOpen,
      toggleTabletSidebar,
      navScrollTop,
    ],
  );

  return <LayoutContext.Provider value={layoutValue}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
