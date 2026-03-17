# 架构门禁与边界规则

## 依赖方向

- `presentation (pages/components/hooks)` -> `application` -> `domain` / `infrastructure`
- 禁止反向依赖：`domain/application/infrastructure` 不允许 import `pages`

## 刷新一致性规则

- 业务写操作后统一通过 `UnifiedRefreshHub` 触发刷新
- 不再在页面层手写多路 `invalidate + window event`
- 新增数据表接入时，必须登记到 `unifiedRefreshQueryMap`

## 服务落位规范

- 订单编排放 `src/application/order/useCases`
- 数据访问放 `src/infrastructure/db/repositories`
- UI 错误反馈放 `src/presentation/feedback`

## PR 必查项

- 是否新增了跨层依赖或旁路 Supabase 调用
- 是否重复注册 realtime 监听
- 是否通过统一刷新入口
- 是否补充了对应域的用例/仓储层入口

