import { useLayoutEffect, useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "spaLayoutStability";

/** 是否启用全局防闪跳（默认开；localStorage spaLayoutStability === 'off' 可关，便于对比） */
export function isSpaLayoutStabilityEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/**
 * 全局 SPA 布局稳定：关闭浏览器滚动恢复；路由切换时用「双 requestAnimationFrame」延后执行滚动归零，
 * 让新页先完成一帧布局再复位，减轻与顶栏不同步的闪跳。
 * 须放在 Router 内（与 SpaNavigationBridge 同级）。localStorage spaLayoutStability=off 可关闭对比效果。
 */
export function SpaLayoutStability() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || !("scrollRestoration" in window.history)) return;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  useLayoutEffect(() => {
    if (!isSpaLayoutStabilityEnabled()) return;

    const applyScrollReset = () => {
      const mains: HTMLElement[] = [];
      const a = document.getElementById("main-content");
      const b = document.getElementById("mobile-main-content");
      const adminMain = document.getElementById("admin-main");
      if (a) mains.push(a);
      if (b) mains.push(b);
      if (adminMain) mains.push(adminMain);
      for (const el of document.querySelectorAll<HTMLElement>("[data-spa-scroll-root]")) {
        /* 会员壳层由 PullToRefresh 在路由切换时自行 scrollTop=0，避免与全局双次复位抢帧导致闪跳 */
        if (el.closest(".member-portal-wrap")) continue;
        if (!mains.includes(el)) mains.push(el);
      }

      for (const el of mains) {
        el.scrollTop = 0;
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    // 双 rAF：多等一帧再复位，减少顶栏/主区域与滚动复位不同步造成的闪跳
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(applyScrollReset);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  return null;
}
