# 执行迁移

## 20260309120000 - 订单筛选统计修复

修复订单管理「卡值总和」「利润总和」只统计当前页的 bug，改为统计全量筛选结果。

**迁移文件**: `migrations/20260309120000_order_filter_stats.sql`

---

## 20260307120000 - 仪表盘交易用户修复

由于 `supabase db push` 需要登录，请按以下方式之一执行迁移：

## 方式一：Supabase 控制台（推荐）

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 左侧菜单进入 **SQL Editor**
4. 新建查询，依次复制粘贴以下迁移的全部内容并执行：
   - `migrations/20260307120000_fix_dashboard_trading_users.sql`
   - `migrations/20260309120000_order_filter_stats.sql`
   - `migrations/20260309130000_fix_trading_users_count_distinct.sql`
5. 点击 **Run** 执行

## 方式二：Supabase CLI 登录后推送

```bash
npx supabase login
npx supabase db push
```

## 迁移内容

- 修复 `get_dashboard_trend_data`：每日交易用户去重、周期内唯一交易用户统计
- 修复 `platform_get_dashboard_trend_data`：同上
- 新增 summary 行（day_date=NULL）供前端展示汇总数据
