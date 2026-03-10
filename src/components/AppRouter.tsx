import { ReactNode } from "react";
import { BrowserRouter, HashRouter } from "react-router-dom";

/**
 * 在 Electron (file://) 或 Capacitor 原生应用中必须使用 HashRouter，
 * 否则客户端路由会因无法加载不存在的文件而失败。
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
