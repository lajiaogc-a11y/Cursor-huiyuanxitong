import { ReactNode } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";

/**
 * 生产环境使用 HashRouter，避免 Cloudflare Pages 等静态托管对 SPA 路由的兼容问题。
 * 开发环境使用 BrowserRouter，Vite dev server 会正确处理所有路径。
 * Electron/Capacitor 也使用 HashRouter。
 */
function useHashRouter(): boolean {
  if (typeof window === "undefined") return false;
  const isFile = window.location.protocol === "file:";
  const isCapacitor = !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  const isProduction = import.meta.env.PROD;
  return isFile || isCapacitor || isProduction;
}

export function AppRouter({ children }: { children: ReactNode }) {
  const useHash = useHashRouter();
  const Router = useHash ? HashRouter : BrowserRouter;
  return <Router>{children}</Router>;
}
