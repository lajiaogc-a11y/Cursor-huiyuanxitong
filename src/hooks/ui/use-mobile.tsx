import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/** 首帧即与视口一致，避免 `undefined -> false` 误判桌面导致布局闪跳（如汇率页利润分析） */
function getInitialIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getInitialIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(false);

  React.useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsTablet(w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isTablet;
}

/** 与 Tailwind `lg`（1024px）对齐；用于仅在一侧挂载 DOM，避免重复 id（如删除数据弹窗） */
function getInitialIsLgUp(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= TABLET_BREAKPOINT;
}

export function useIsLgUp() {
  const [isLgUp, setIsLgUp] = React.useState<boolean>(getInitialIsLgUp);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT}px)`);
    const onChange = () => setIsLgUp(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLgUp(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isLgUp;
}
