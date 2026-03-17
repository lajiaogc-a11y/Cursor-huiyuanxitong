# Supabase 前端迁移计划

> 扫描时间：2025-03  
> 目标：将 `supabase.from` / `supabase.rpc` / `supabase.auth` 全部迁移为 API 调用

---

## 一、调用统计总览

| 类型 | 文件数 | 调用数 | 说明 |
|------|--------|--------|------|
| supabase.from | 39 | ~155 | 表查询/增删改 |
| supabase.rpc | 30 | ~95 | RPC 存储过程 |
| (supabase.rpc as any) | 8 | ~55 | 类型断言写法 |
| supabase.auth | 7 | 16 | 认证相关 |
| **合计** | **68 文件** | **~320** | 含重叠 |

**已迁移**：`memberPointsRpcService.ts` 中 3 个 RPC（member_get_points, member_get_points_breakdown, member_get_spin_quota）→ apiGet

**按文件调用数排序（Top 15）**：

| 文件 | 调用数 |
|------|--------|
| DataManagementTab.tsx | 67 |
| tenantService.ts | 20 |
| useMerchantConfig.ts | 20 |
| AuthContext.tsx | 14 |
| memberPortalSettingsService.ts | 14 |
| phonePoolService.ts | 10 |
| dataMigrationService.ts | 9 |
| taskService.ts | 7 |
| exportService.ts | 7 |
| useActivityDataContent.ts | 6 |
| useMembers.ts | 5 |
| pointsService.ts | 6 |
| memberPointsMallService.ts | 6 |
| useReportData.ts | 6 |
| balanceLogReconcileService.ts | 6 |

---

## 二、supabase.from 调用明细

| 文件 | 调用数 | 涉及表 |
|------|--------|--------|
| DataManagementTab.tsx | 66 | navigation_config, orders, members, points_ledger, activity_gifts, member_activity, points_accounts, referral_relations, ledger_transactions, balance_change_logs, shared_data_store, shift_handovers, shift_receivers, audit_records, operation_logs, employee_login_logs, knowledge_articles, knowledge_categories |
| useMerchantConfig.ts | 20 | cards, vendors, payment_providers, ledger_transactions, balance_change_logs, activity_gifts |
| useActivityDataContent.ts | 6 | activity_gifts, payment_providers, referral_relations, member_activity, points_ledger, points_accounts |
| useMembers.ts | 5 | orders, points_ledger, activity_gifts, member_activity, members |
| orderImportService.ts | 5 | cards, vendors, payment_providers, employees, members |
| balanceLogRepairService.ts | 4 | ledger_transactions |
| OperationLogs.tsx | 4 | member_activity |
| ShiftHandoverTab.tsx | 4 | vendors, payment_providers |
| merchantConfigStore.ts | 3 | card_types |
| MerchantSettlement.tsx | 2 | employees, activity_gifts |
| activitySettingsStore.ts | 2 | activity_reward_tiers |
| RateCalculator.tsx | 2 | activity_gifts |
| 其他 | ~30 | 各业务表 |

---

## 三、supabase.rpc 调用明细

| 文件 | 调用数 | RPC 名称 |
|------|--------|----------|
| tenantService.ts | 20 | check_tenant_create_conflicts, update_tenant_basic_info, reset_tenant_admin_password, list_tenants_for_platform_admin, create_tenant_with_admin, delete_tenant, platform_get_tenant_orders_full, platform_get_tenant_usdt_orders_full, platform_get_tenant_members_full, get_my_tenant_orders_full, get_my_tenant_usdt_orders_full, get_my_tenant_members_full, get_my_tenant_dashboard_trend, platform_get_dashboard_trend_data, get_dashboard_trend_data, platform_get_tenant_employees_full, platform_get_tenant_overview, platform_get_tenant_orders, platform_get_tenant_members, set_tenant_super_admin |
| memberPortalSettingsService.ts | 14 | get_my_member_portal_settings, upsert_my_member_portal_settings, member_get_portal_settings, member_get_portal_settings_by_invite_code, member_get_portal_settings_by_account, member_get_default_portal_settings, create_my_member_portal_settings_version, list_my_member_portal_settings_versions, rollback_my_member_portal_settings_version, submit_my_member_portal_settings_for_approval, approve_my_member_portal_settings_version, list_my_member_spin_wheel_prizes, upsert_my_member_spin_wheel_prizes, member_get_spin_wheel_prizes |
| phonePoolService.ts | 9 | phone_bulk_import, rpc_extract_phones, rpc_return_phones, rpc_phone_stats, rpc_clear_phone_pool, rpc_phone_extract_settings, rpc_phone_extract_records, rpc_update_phone_extract_settings, rpc_consume_phones |
| dataMigrationService.ts | 9 | preview_tenant_data_migration, export_tenant_data_json, list_tenant_migration_jobs, list_tenant_migration_jobs_v2, get_tenant_migration_conflict_details, execute_tenant_data_migration, rollback_tenant_migration_job, verify_tenant_migration_job, export_tenant_migration_audit_bundle |
| AuthContext.tsx | 6 | get_my_employee_info, verify_employee_login_detailed, log_employee_login, check_employee_login_lock, record_employee_login_failure, clear_employee_login_failures |
| ledgerTransactionService.ts | 5 | create_ledger_entry, soft_delete_ledger_entry, set_initial_balance_entry, recompute_account_balance, reverse_all_entries_for_order |
| employeeStore.ts | 5 | get_my_tenant_employees_full, platform_get_tenant_employees_full, platform_delete_employee, tenant_delete_employee |
| maintenanceModeService.ts | 4 | get_maintenance_mode_status, set_global_maintenance_mode, set_tenant_maintenance_mode, get_tenant_maintenance_modes |
| memberPointsMallService.ts | 6 | list_my_member_points_mall_items, upsert_my_member_points_mall_items, member_list_points_mall_items, member_redeem_points_mall_item, list_my_member_points_mall_redemptions, process_my_member_points_mall_redemption |
| memberPortalSettingsService.ts | (见上) | |
| 其他 | ~30 | 见下表 |

---

## 四、supabase.auth 调用明细

| 文件 | 调用数 | 方法 |
|------|--------|------|
| AuthContext.tsx | 8 | signOut, onAuthStateChange, getSession, signInWithPassword |
| useSessionExpiration.ts | 3 | getSession, signOut, onAuthStateChange |
| api/client.ts | 1 | getSession（token 兼容） |
| operatorService.ts | 1 | getUser |
| phonePoolService.ts | 1 | getUser |
| shiftHandoverStore.ts | 1 | getUser |
| userDataSyncService.ts | 1 | getUser |
| ErrorBoundary.tsx | 1 | getUser |

---

## 五、按模块迁移计划

### 阶段 1：members 模块 ✅ 已完成

| 文件 | from | rpc | 状态 |
|------|------|-----|------|
| useMembers.ts | 5 | 0 | ✅ 已迁移 |
| tenantService (members 相关) | 0 | 2 | ✅ 已迁移（fetchMembersFromDb 改用 listMembersApi） |
| orderImportService (members) | 1 | 0 | ✅ 已迁移 |
| memberImportService.ts | 2 | 0 | ✅ 已迁移 |
| ActivityReports.tsx | 1 | 0 | ✅ 已迁移 |
| referral_relations | 1 | 0 | ✅ GET /api/members/referrals |
| memberLookupService.ts | 0 | 1 | ⏳ 待迁移 |
| customerDetailService.ts | 4 | 0 | ⏳ 待迁移 |
| memberPortalSettingsService.ts | 0 | 14 | ⏳ 待迁移 |
| memberPointsMallService.ts | 0 | 6 | ⏳ 待迁移 |

### 阶段 2：giftcards 模块 ✅ 已完成

| 文件 | from | rpc | 状态 |
|------|------|-----|------|
| useMerchantConfig.ts | 20 | 0 | ✅ 已迁移 |
| merchantConfigReadService.ts | 3 | 0 | ✅ 已迁移 |
| orderImportService.ts | 3 | 0 | ✅ 已迁移 |
| ShiftHandoverTab.tsx | 4 | 0 | ✅ 已迁移 |
| useReportData.ts | 3 | 0 | ✅ 已迁移 |
| exportService.ts | 3 | 0 | ✅ 已迁移 |
| useActivityDataContent.ts | 1 | 0 | ✅ 已迁移 |
| balanceLogRepairService.ts | 4 | 0 | ✅ 已迁移 |
| balanceLogReconcileService.ts | 2 | 0 | ✅ 已迁移 |

### 阶段 3：orders 模块

| 文件 | from | rpc | 后端需新增 |
|------|------|-----|------------|
| tenantService (orders) | 0 | 2 | GET /api/orders/full, /api/orders/usdt-full |
| orderQueries | 0 | 0 | 依赖 tenantService |
| orderSideEffectOrchestrator | 1 | 0 | 合并到订单创建流程 |
| DataManagementTab (orders) | 4 | 0 | POST /api/data/archive（批量归档） |

### 阶段 4：points 模块

| 文件 | from | rpc | 后端需新增 |
|------|------|-----|------------|
| memberPointsRpcService | 0 | 0 | ✅ 已迁移 |
| RateCalculator.tsx | 2 | 1 | POST /api/points/redeem |
| MemberActivityDataContent.tsx | 0 | 1 | POST /api/points/redeem |
| pointsService.ts | 5 | 0 | 需迁移 createPointsOnOrderCreate 等 |

### 阶段 5：whatsapp 模块

| 文件 | from | rpc | 说明 |
|------|------|-----|------|
| 无独立 whatsapp 模块 | - | - | 当前无，预留 |

### 阶段 6：auth 模块

| 文件 | auth | rpc | 后端需新增 |
|------|------|-----|------------|
| AuthContext.tsx | 8 | 6 | /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/session |
| useSessionExpiration.ts | 3 | 1 | /api/auth/check-session |
| Login.tsx | 0 | 0 | 使用 signInWithPassword → 改为 apiPost /api/auth/login |
| Signup.tsx | 0 | 1 | POST /api/auth/signup |

### 阶段 7：其他高耦合

| 文件 | 说明 |
|------|------|
| DataManagementTab.tsx | 66 from + 1 rpc，数据归档/清理，建议单独 /api/data/archive 端点 |
| tenantService.ts | 20 rpc，租户/平台管理，需 /api/tenant/* |
| sharedDataService.ts | 2 rpc，共享配置，需 /api/shared-data/* |
| ledgerTransactionService.ts | 5 rpc，需 /api/finance/ledger/* |

---

## 六、迁移优先级建议

| 优先级 | 模块 | 文件数 | 调用数 | 说明 |
|--------|------|--------|--------|------|
| P0 | points | 3 | 8 | 部分已迁移，补全 redeem |
| P1 | members | 6 | 30+ | 核心业务 |
| P2 | giftcards | 3 | 25 | 商家配置 |
| P3 | orders | 5 | 10+ | 依赖 tenantService |
| P4 | tenant | 1 | 20 | 平台/租户 RPC |
| P5 | 共享数据 | 2 | 2 | sharedDataService |
| P6 | 财务 | 2 | 5 | ledgerTransactionService |
| P7 | auth | 4 | 18 | 最后迁移 |
| P8 | 数据管理 | 1 | 67 | DataManagementTab 归档 |

---

## 七、后端 API 端点规划

| 模块 | 端点 | 方法 |
|------|------|------|
| auth | /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/check-session | POST, POST, GET, GET |
| members | /api/members, /api/members/full, /api/members/referrals, /api/members/by-phone, /api/members/delete-cascade | GET, GET, GET, GET, POST |
| members | /api/members/portal/*, /api/members/points-mall/* | 多个 |
| giftcards | /api/giftcards/cards, /api/giftcards/vendors, /api/giftcards/providers | CRUD |
| orders | /api/orders/full, /api/orders/usdt-full | GET |
| points | /api/points/redeem | POST |
| tenant | /api/tenant/* | 多个 |
| shared-data | /api/shared-data/get, /api/shared-data/upsert | GET, POST |
| finance | /api/finance/ledger/* | 多个 |
| data | /api/data/archive | POST |

---

## 八、迁移步骤模板

1. **后端**：在 `server/src/modules/*` 新增对应 controller/service/repository
2. **前端**：新建或修改 service 层，将 supabase 调用改为 apiGet/apiPost
3. **验证**：功能测试、回归
4. **清理**：移除该文件中的 supabase import 及调用
