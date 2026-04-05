# 执行迁移（历史记录）

> **注意**: 以下迁移文件已在 2026-04 清理中删除（SQL 早已在线上数据库执行完毕，本地文件仅为历史记录）。
> 如需查看原始 SQL，请从 Git 历史中恢复。

## 20260309120000 - 订单筛选统计修复

修复订单管理「卡值总和」「利润总和」只统计当前页的 bug，改为统计全量筛选结果。

**迁移文件**: `migrations/20260309120000_order_filter_stats.sql`（已删除）

---

## 20260307120000 - 仪表盘交易用户修复

### 迁移内容

- 修复 `get_dashboard_trend_data`：每日交易用户去重、周期内唯一交易用户统计
- 修复 `platform_get_dashboard_trend_data`：同上
- 新增 summary 行（day_date=NULL）供前端展示汇总数据

**相关迁移文件**（均已删除）:
- `migrations/20260307120000_fix_dashboard_trading_users.sql`
- `migrations/20260309120000_order_filter_stats.sql`
- `migrations/20260309130000_fix_trading_users_count_distinct.sql`
