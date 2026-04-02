import { QueryClient, keepPreviousData } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,              // 30s：同页签内数据会标记为 stale，切换左侧导航回来时若未过期则直接用缓存、不重复打满屏加载
      gcTime: 30 * 60 * 1000,         // 30 minutes garbage collection – keep cache alive across long sessions
      refetchOnMount: true,           // 仅当缓存已 stale 时在挂载时后台刷新；避免每次 SPA 切页都全量 invalidate + always 重拉
      refetchOnWindowFocus: false,    // disable auto-refetch on tab focus to avoid mid-use interruptions
      refetchOnReconnect: true,
      retry: 2,
      placeholderData: keepPreviousData, // show previous data during query-key transitions instead of loading skeleton
    },
    mutations: {
      retry: 1,
    },
  },
});
