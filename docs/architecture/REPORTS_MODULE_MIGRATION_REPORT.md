# Reports / Analytics 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第八阶段 - Reports / Analytics 模块迁移

---

## 一、迁移范围说明

Reports 模块涉及：

- **tenants** 表：租户 count（平台总览）
- **employees** 表：活跃员工 count、报表基础员工列表
- **orders** 表：今日订单 count、报表订单列表（日期、creator 过滤）
- **audit_records** 表：待审核 count
- **activity_gifts** 表：活动赠送报表

---

## 二、迁移清单（扫描结果）

### 2.1 查询表与字段

| 表 | 查询类型 | 字段/逻辑 |
|----|----------|-----------|
| tenants | count | 租户总数 |
| employees | count / select | status='active'；id, real_name, username, role |
| orders | count / select | created_at >= todayStart；*（含日期、creator 过滤） |
| audit_records | count | status='pending' |
| activity_gifts | select | *（含日期、creator 过滤） |

### 2.2 统计逻辑

| 统计项 | 逻辑 |
|--------|------|
| 租户总数 | tenants.count（仅平台管理员） |
| 活跃员工 | employees.count where status='active' |
| 今日订单 | orders.count where created_at >= todayStart |
| 待审核 | audit_records.count where status='pending' |
| 报表员工 | employees.select(id, real_name, username, role) |
| 报表订单 | orders.select(*) 按 startDate/endDate/creatorId 过滤 |
| 报表活动赠送 | activity_gifts.select(*) 按 startDate/endDate/creatorId 过滤 |

---

## 三、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `server/src/modules/reports/types.ts` | **新增**，DashboardStats、OrdersReportQuery、ActivityGiftsReportQuery |
| `server/src/modules/reports/repository.ts` | **新增**，getDashboardStatsRepository、getOrdersReportRepository、getActivityGiftsReportRepository、getReportBaseEmployeesRepository |
| `server/src/modules/reports/service.ts` | **新增**，封装 repository，Dashboard 5 秒内存缓存 |
| `server/src/modules/reports/controller.ts` | **新增**，getDashboardController、getOrdersReportController、getActivityGiftsReportController、getBaseDataController |
| `server/src/modules/reports/routes.ts` | **新增**，GET /dashboard、/orders、/activity-gifts、/base-data |
| `server/src/app.ts` | 挂载 reports 路由 |
| `src/services/reports/reportsApiService.ts` | **新增**，getDashboardStatsApi、getOrdersReportApi、getActivityGiftsReportApi、getReportBaseDataApi |
| `src/hooks/useReportData.ts` | employees/orders/activity_gifts → reportsApiService |
| `src/pages/AdminOverview.tsx` | loadStats → getDashboardStatsApi |

---

## 四、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/reports/dashboard | Dashboard 统计（tenants、activeEmployees、todayOrders、pendingAudits），5 秒缓存 |
| GET | /api/reports/orders | 订单报表，query: startDate、endDate、creatorId |
| GET | /api/reports/activity-gifts | 活动赠送报表，query: startDate、endDate、creatorId |
| GET | /api/reports/base-data | 报表基础数据（employees） |

**认证**：所有接口需 `authMiddleware`，tenant_id 从 JWT 解析，平台管理员（无 tenant_id）可见全平台数据。

---

## 五、Supabase 调用替换情况

| 文件 | 替换前 | 替换后 |
|------|--------|--------|
| useReportData.ts | supabase.from('employees') | getReportBaseDataApi() |
| useReportData.ts | supabase.from('orders') | getOrdersReportApi() |
| useReportData.ts | supabase.from('activity_gifts') | getActivityGiftsReportApi() |
| AdminOverview.tsx | supabase.from('tenants/employees/orders/audit_records') | getDashboardStatsApi() |

**说明**：cards、vendors、providers 仍通过 giftcardsApiService（已迁移），未使用 Supabase 直连。

---

## 六、缓存策略

| 场景 | 策略 |
|------|------|
| Dashboard 统计 | 后端 service 层 5 秒内存缓存 |
| 报表基础数据 | 前端 react-query 5 分钟 staleTime |
| 报表过滤数据 | 前端 react-query 5 分钟 staleTime |

---

## 七、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| Dashboard 加载（AdminOverview） | 待运行时验证 |
| 报表统计（ReportManagement） | 待运行时验证 |
| 订单统计 | 待运行时验证 |
| 会员/活动赠送统计 | 待运行时验证 |

**验证步骤**：
1. 启动后端：`cd server && npm run dev`
2. 启动前端：`npm run dev`
3. 登录后测试：平台总览、报表管理页（日期筛选、员工筛选）

---

## 八、依赖说明

- **Auth**：API 依赖 JWT，auth 中间件解析 tenant_id、isPlatformAdmin
- **tenant_id**：平台管理员（无 tenant_id）可见 tenants count；租户员工仅见本租户 employees/orders
- **activity_gifts**：若表无 tenant_id 列，后端通过 creator_id 关联 employees 过滤（当前 repository 支持 tenantId 参数，由 controller 传入）
