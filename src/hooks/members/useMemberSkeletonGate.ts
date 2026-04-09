/**
 * 骨架屏是否与「加载中」同步：无最短展示时间，数据返回即切真实内容。
 * 配合 QueryClient 默认 `placeholderData: keepPreviousData`，Tab/返回时优先展示缓存，避免骨架闪现。
 */
export function useMemberSkeletonGate(loading: boolean): boolean {
  return loading;
}
