# 架构重构基线图（Baseline）

## 当前依赖主链

- `pages -> hooks -> services -> supabase`
- 存在旁路：`pages -> services`、`pages -> supabase`、`hooks -> supabase`
- 刷新链路并行：`dataRefreshManager` + `realtimeManager` + 局部 hook 订阅（已开始收敛）

## 热点高耦合文件

- `src/pages/OrderManagement.tsx`
- `src/pages/ExchangeRate.tsx`
- `src/pages/MerchantSettlement.tsx`
- `src/hooks/orders/useOrderMutations.ts`
- `src/hooks/orders/useUsdtOrderMutations.ts`
- `src/hooks/useMembers.ts`
- `src/hooks/useEmployees.ts`
- `src/services/orderSideEffectOrchestrator.ts`
- `src/services/sharedDataService.ts`
- `src/services/dataRefreshManager.ts`

## 刷新一致性问题源

- 同一表变更可能触发多次刷新（全局订阅 + hook 订阅 + 手动 invalidate）
- React Query 与内存缓存（store/nameResolver）双轨并存
- legacy window 事件和 query invalidation 混用，边界不清

## 重构目标对照

- 降耦：页面只消费 hooks，hooks 尽量不直连底层 RPC
- 一致性：统一刷新入口 + 单一 query key 映射
- 可维护：services 分业务域目录，新增调用门禁规则

