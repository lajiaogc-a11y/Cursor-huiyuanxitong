# 页面流程 (Page Flow)

## 概述

`src/pages` 下每个页面对应路由，通过 hooks 和 services 获取数据。

---

## 管理端页面

### Dashboard

- **路径**：`/`
- **Services/Hooks**：`useDashboardTrend` (get_dashboard_trend_data), tenantService
- **功能**：仪表盘概览、趋势图、订单/利润统计

### Login

- **路径**：`/login`
- **Services**：AuthContext (verify_employee_login_detailed, signInWithPassword)
- **功能**：员工登录

### Signup

- **路径**：`/signup`
- **RPC**：`signup_employee`
- **功能**：员工注册

### MemberManagement

- **路径**：`/members`
- **Services/Hooks**：useMembers, memberLookupService, admin_set_member_initial_password
- **功能**：会员 CRUD、按手机号查询、设置初始密码

### OrderManagement

- **路径**：`/orders`
- **Services/Hooks**：useOrders/useUsdtOrders, tenantService, get_order_filter_stats
- **功能**：订单 CRUD、筛选、统计

### EmployeeManagement

- **路径**：`/employees`
- **Services**：employeeStore, admin_reset_password
- **功能**：员工 CRUD、重置密码

### ExchangeRate

- **路径**：`/exchange-rate`
- **Services**：exchangeService, sharedDataService, pointsService, redeem_points_and_record
- **功能**：汇率设置、卡片汇率、积分兑换、工作任务、号码提取

### SystemSettings

- **路径**：`/settings`
- **Services**：各 Tab 对应 settings（Currency, Points, Activity, Gift, Permission, CustomerSource, Copy, Data, Api, Ip 等）
- **功能**：系统配置管理

### CustomerQuery

- **路径**：`/customer-query`
- **Services**：customerDetailService, memberLookupService
- **功能**：客户详情查询

### MerchantManagement

- **路径**：`/merchants`
- **Services**：merchantConfigStore (cards, vendors, payment_providers)
- **功能**：卡片、商户、代付商家管理

### MerchantSettlement

- **路径**：`/merchant-settlement`
- **Services**：settlementCalculationService, ledgerTransactionService
- **功能**：商户结算、对账

### ActivityReports

- **路径**：`/activity-reports`
- **Services**：activity_gifts 表, delete_activity_gift_and_restore
- **功能**：活动礼品报表、删除礼品

### MemberActivityData

- **路径**：`/member-activity`
- **Services**：activity_gifts, member_activity, points_ledger, redeem_points_and_record
- **功能**：会员活动数据、积分兑换

### ReportManagement

- **路径**：`/reports`
- **Services**：useReportData (orders, activity_gifts)
- **功能**：报表导出

### OperationLogs

- **路径**：`/operation-logs`
- **Services**：operation_logs 表
- **功能**：操作日志查询

### LoginLogs

- **路径**：`/login-logs`
- **Services**：employee_login_logs, employees
- **功能**：登录日志

### AuditCenter

- **路径**：`/audit-center`
- **Services**：audit_records
- **功能**：审计中心

### PendingAuthorization

- **路径**：`/pending-authorization`
- **功能**：待审批

### KnowledgeBase

- **路径**：`/knowledge`
- **Services**：useKnowledge (platform_get_tenant_knowledge_categories, platform_get_tenant_knowledge_articles)
- **功能**：知识库

### CompanyManagement

- **路径**：`/admin/tenants`
- **Services**：tenantService (listTenants, createTenantWithAdmin, deleteTenant)
- **功能**：租户管理

### PlatformTenantView

- **路径**：`/admin/tenant-view`
- **Services**：tenantService (getTenantOrdersFull, getTenantMembersFull, getTenantOverview 等)
- **功能**：平台租户数据视图

### PlatformSettingsPage

- **路径**：`/admin/settings/:tab`
- **功能**：平台设置（IP 控制、API 等）

### TasksSettings

- **路径**：`/tasks/settings`
- **Services**：taskService (generateCustomerList, createCustomerMaintenanceTask)
- **功能**：维护设置、任务创建

### TasksHistory

- **路径**：`/tasks/history`
- **Services**：useTaskHistory (getTaskProgressList)
- **功能**：维护历史

### TasksPosters

- **路径**：`/tasks/posters`
- **Services**：taskService (海报上传、任务创建)
- **功能**：发动态（海报库）

### TasksPhoneExtract

- **路径**：`/tasks/phone-extract`
- **Services**：phonePoolService
- **功能**：号码提取设置、批量导入、清空

### PublicRates

- **路径**：`/public-rates`
- **功能**：公开汇率

### NotFound

- **路径**：`/404`

---

## 会员端页面

### MemberLogin

- **路径**：`/member/login`
- **Services**：MemberAuthContext (verify_member_password)

### MemberDashboard

- **路径**：`/member/dashboard`
- **RPC**：member_check_in_today, member_grant_spin_for_share, member_check_in
- **功能**：签到、分享抽奖

### MemberSpin

- **路径**：`/member/spin`
- **RPC**：member_get_spins, member_spin
- **功能**：抽奖

### MemberPoints

- **路径**：`/member/points`
- **RPC**：member_redeem_prize, member_get_points
- **功能**：积分查看、兑换

### MemberInvite

- **路径**：`/member/invite`
- **功能**：邀请

### MemberSettings

- **路径**：`/member/settings`
- **RPC**：member_update_nickname
- **功能**：昵称修改

### InviteLanding

- **路径**：`/invite/:code`
- **RPC**：validate_invite_and_submit
- **功能**：邀请落地页、提交
