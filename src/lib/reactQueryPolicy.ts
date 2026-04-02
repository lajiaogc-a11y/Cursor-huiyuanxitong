/**
 * 全局默认见 queryClient.ts；列表/轮询类 hook 可显式引用本常量，避免重复请求与过密轮询。
 * 侧栏 SPA 切换不再全量 invalidate；refetchOnMount 仅在缓存 stale 时后台刷新，秒回已访问页靠 gcTime 保留的缓存。
 */
/** 列表、配置类数据：与全局 queryClient 默认一致（30s） */
export const STALE_TIME_LIST_MS = 30_000;

/** 需要主动轮询实时性的场景（如订单列表） */
export const POLL_INTERVAL_RELAXED_MS = 2 * 60 * 1000;
