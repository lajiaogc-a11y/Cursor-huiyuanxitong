import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type LayoutMode = 'fullWidth' | 'centered';

interface LayoutContextType {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  toggleLayoutMode: () => void;
  tabletSidebarOpen: boolean;
  setTabletSidebarOpen: (open: boolean) => void;
  toggleTabletSidebar: () => void;
  /**
   * 强制使用电脑端布局（小屏/平板下也显示完整侧边栏）
   */
  forceDesktopLayout: boolean;
  setForceDesktopLayout: (v: boolean) => void;
  toggleForceDesktopLayout: () => void;
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
  const [forceDesktopLayout, setForceDesktopLayoutState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('appLayoutMode') as LayoutMode;
    if (saved === 'fullWidth' || saved === 'centered') {
      setLayoutModeState(saved);
    }
    const savedForce = localStorage.getItem('forceDesktopLayout');
    if (savedForce === 'true') {
      setForceDesktopLayoutState(true);
    }
  }, []);

  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode);
    localStorage.setItem('appLayoutMode', mode);
  };

  const toggleLayoutMode = () => {
    setLayoutMode(layoutMode === 'fullWidth' ? 'centered' : 'fullWidth');
  };

  const toggleTabletSidebar = () => {
    setTabletSidebarOpen(prev => !prev);
  };

  const setForceDesktopLayout = (v: boolean) => {
    setForceDesktopLayoutState(v);
    localStorage.setItem('forceDesktopLayout', String(v));
  };

  const toggleForceDesktopLayout = () => {
    const next = !forceDesktopLayout;
    setForceDesktopLayout(next);
    window.location.reload(); // 切换布局需刷新以正确渲染
  };

  return (
    <LayoutContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        toggleLayoutMode,
        tabletSidebarOpen,
        setTabletSidebarOpen,
        toggleTabletSidebar,
        forceDesktopLayout,
        setForceDesktopLayout,
        toggleForceDesktopLayout,
        navScrollTop,
        setNavScrollTop,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
