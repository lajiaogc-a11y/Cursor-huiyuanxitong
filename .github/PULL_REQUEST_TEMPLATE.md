## 变更说明

- [ ] 描述本次改动的业务目标与范围

## 架构检查（必填）

- [ ] 未新增 `pages -> supabase` 直连
- [ ] 未新增 `pages -> infrastructure` 直连
- [ ] 刷新链路已走统一入口（`UnifiedRefreshHub` / `notifyDataMutation`）
- [ ] 未重复注册 realtime 订阅
- [ ] 新增逻辑已按分层落位（`application/domain/infrastructure/presentation`）

## 验证清单

- [ ] 已本地执行 lint
- [ ] 已本地执行 build
- [ ] 核心页面手动回归通过（订单/会员/员工）

