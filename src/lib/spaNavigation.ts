/**
 * 站内导航统一走 React Router，避免 window.location 触发整页刷新。
 * 在 <BrowserRouter> 内挂载 SpaNavigationBridge 后，spaNavigate 会使用 useNavigate。
 */

/**
 * 与 AppRouter 一致：BrowserRouter 用 pathname；HashRouter（file:// / Capacitor）用 hash。
 * 401 全局处理等必须用此函数，否则会误把会员登录页当成非登录页并错误跳转。
 */
export function getSpaPathname(): string {
  if (typeof window === 'undefined') return '/';
  const cap = !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  const useHash = window.location.protocol === 'file:' || cap;
  if (useHash) {
    const raw = (window.location.hash.replace(/^#/, '') || '/').split('?')[0] || '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
  const p = window.location.pathname || '/';
  return p;
}

export type SpaNavigateFn = (to: string, options?: { replace?: boolean }) => void;

let spaNavigateImpl: SpaNavigateFn | null = null;

/** 由 SpaNavigationBridge 注册 / 卸载 */
export function setSpaNavigate(fn: SpaNavigateFn | null): void {
  spaNavigateImpl = fn;
}

/**
 * 同域站内路径（以 / 开头）优先 SPA 跳转；未注册时回退 location（首屏 401 等极早场景）。
 * 外链或非路径字符串请仍用 window.location 或 <a target="_blank">。
 */
export function spaNavigate(to: string, options?: { replace?: boolean }): void {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) {
    console.warn('[spaNavigate] 非站内路径，改用 location:', to);
    if (options?.replace) window.location.replace(to);
    else window.location.assign(to);
    return;
  }
  if (spaNavigateImpl) {
    spaNavigateImpl(to, options);
    return;
  }
  if (options?.replace) window.location.replace(to);
  else window.location.assign(to);
}
