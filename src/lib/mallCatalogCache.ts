/**
 * 积分商城目录的模块级内存缓存。
 * 独立文件以避免 MemberAuthContext ↔ MemberPoints 循环依赖。
 */

export type PointsMallItemLike = { id: string; [k: string]: unknown };

const _mallCache = new Map<string, PointsMallItemLike[]>();

export function getMallCache(): Map<string, PointsMallItemLike[]> {
  return _mallCache;
}

/** Clear the in-memory mall catalog cache (call on logout / account switch). */
export function clearMallCatalogCache(): void {
  _mallCache.clear();
}

function _clearMallCacheOnSignout() { _mallCache.clear(); }
if (typeof window !== "undefined") {
  window.addEventListener("member:signout", _clearMallCacheOnSignout);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener("member:signout", _clearMallCacheOnSignout));
  }
}
