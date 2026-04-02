import { ReactNode } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";

/**
 * Nginx try_files 提供 SPA fallback，统一使用 BrowserRouter。
 * 仅 file:// 协议（Electron/本地打开）或 Capacitor 使用 HashRouter。
 */
function useHashRouter(): boolean {
  if (typeof window === "undefined") return false;
  const isFile = window.location.protocol === "file:";
  const isCapacitor = !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  return isFile || isCapacitor;
}

export function AppRouter({ children }: { children: ReactNode }) {
  const useHash = useHashRouter();
  const Router = useHash ? HashRouter : BrowserRouter;
  return <Router>{children}</Router>;
}
