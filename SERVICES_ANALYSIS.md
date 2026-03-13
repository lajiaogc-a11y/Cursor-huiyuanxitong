# 服务层分析 (Services Analysis)

## 概述

`src/services` 包含与 Supabase 数据库、RPC、存储交互的业务服务。

---

## 1. phonePoolService.ts

- **职责**：号码池管理（批量导入、提取、归还、统计、清空、配置）
- **RPC**：`phone_bulk_import`, `rpc_extract_phones`, `rpc_return_phones`, `rpc_phone_stats`, `rpc_clear_phone_pool`, `rpc_phone_extract_settings`, `rpc_phone_extract_records`, `rpc_update_phone_extract_settings`
- **表**：`phone_pool`, `phone_reservations`, `phone_extract_settings`（通过 RPC 间接）

---

## 2. sharedDataService.ts

- **职责**：租户共享数据读写（汇率、积分、活动配置等），冷启动默认配置
- **RPC**：`get_shared_data_for_my_tenant`, `upsert_shared_data_for_my_tenant`
- **表**：`shared_data_store`（直接 + RPC）

---

## 3. taskService.ts

- **职责**：任务管理（客户维护、发动态、任务项、海报、进度）
- **RPC**：`get_my_task_items`
- **表**：`employees`, `members`, `orders`, `task_templates`, `tasks`, `task_items`, `task_item_logs`, `task_posters`, `task-posters`（storage）

---

## 4. memberLookupService.ts

- **职责**：按手机号查询会员
- **RPC**：`get_member_by_phone_for_my_tenant`
- **表**：`members`（通过 RPC）

---

## 5. tenantService.ts

- **职责**：租户 CRUD、订单/会员/报表数据获取（平台/租户视角）
- **RPC**：`check_tenant_create_conflicts`, `create_tenant_with_admin`, `update_tenant_basic_info`, `reset_tenant_admin_password`, `list_tenants_for_platform_admin`, `delete_tenant`, `platform_get_tenant_orders_full`, `platform_get_tenant_usdt_orders_full`, `platform_get_tenant_members_full`, `get_my_tenant_orders_full`, `get_my_tenant_usdt_orders_full`, `get_my_tenant_members_full`, `get_my_tenant_dashboard_trend`, `platform_get_tenant_employees_full`, `platform_get_tenant_overview`, `platform_get_dashboard_trend_data`, `platform_get_tenant_orders`, `platform_get_tenant_members`
- **表**：`tenants`, `orders`, `members`, `employees`（通过 RPC）

---

## 6. balanceLogService.ts

- **职责**：商户余额变动日志
- **表**：`balance_change_logs`

---

## 7. customerDetailService.ts

- **职责**：客户详情聚合（会员、订单、积分、活动）
- **表**：`members`, `orders`, `points_ledger`, `member_activity`, `activity_gifts`, `referral_relations`

---

## 8. realtimeManager.ts

- **职责**：Supabase Realtime 订阅管理
- **表**：多表订阅（通过 channel）

---

## 9. exchangeService.ts

- **职责**：积分兑换逻辑（活动1/活动2 判定、币种选择）
- **表**：无直接 DB 调用，依赖 store 配置

---

## 10. webVitalsService.ts

- **职责**：Web 性能指标收集
- **表**：`web_vitals`

---

## 11. dataBackupService.ts

- **职责**：数据备份（调用 Edge Function、读取备份记录）
- **表**：`data_backups`；Edge Function：`scheduled-backup`

---

## 12. webhookService.ts

- **职责**：Webhook 配置与事件发送
- **表**：`webhooks`, `webhook_event_queue`, `webhook_delivery_logs`；RPC：`queue_webhook_event`

---

## 13. ledgerTransactionService.ts

- **职责**：账本分录（创建、冲销、软删除、余额重算）
- **RPC**：`create_ledger_entry`, `soft_delete_ledger_entry`, `set_initial_balance_entry`, `recompute_account_balance`, `reverse_all_entries_for_order`
- **表**：`ledger_transactions`

---

## 14. pointsService.ts

- **职责**：积分明细（消费/推荐积分写入、发放、回收）
- **表**：`points_ledger`, `points_accounts`, `referral_relations`, `members`, `orders`

---

## 15. pointsCalculationService.ts

- **职责**：积分计算（消费积分公式、推荐积分）
- **表**：无直接 DB，依赖 points_ledger、members 等

---

## 16. settlementCalculationService.ts

- **职责**：商户结算计算
- **表**：`orders`, `activity_gifts`, `ledger_transactions`, `balance_change_logs`, `cards`, `vendors`, `payment_providers`

---

## 17. dataArchiveService.ts

- **职责**：数据归档（旧数据迁移到归档表）
- **RPC**：`archive_old_data`
- **表**：`archived_orders`, `archived_operation_logs`, `archived_points_ledger`, `archive_runs`

---

## 18. dataExportImportService.ts

- **职责**：数据导出/导入（订单、会员等）
- **表**：`members`, `orders`, `customer_sources`, `employees`, `cards`, `vendors`, `payment_providers`

---

## 19. export/ (orderImportService, memberImportService, exportService)

- **职责**：订单/会员导入导出、Excel 校验
- **表**：`members`, `orders`, `customer_sources`, `employees`, `cards`, `vendors`, `payment_providers`, `referral_relations`

---

## 20. operatorService.ts

- **职责**：操作员 ID 解析、缓存
- **表**：`employees`（通过 nameResolver）

---

## 21. nameResolver.ts

- **职责**：员工 ID ↔ 姓名 解析
- **表**：`employees`

---

## 22. databaseMigrationService.ts

- **职责**：数据库迁移脚本执行
- **表**：多表（通过 migrations）

---

## 23. orderAnomalyDetection.ts

- **职责**：订单异常检测
- **表**：`orders`

---

## 24. riskScoringService.ts

- **职责**：风险评分
- **表**：`risk_events`, `risk_scores`

---

## 25. resourceMonitorService.ts

- **职责**：资源监控
- **表**：无

---

## 26. cacheManager.ts

- **职责**：缓存失效、Realtime 订阅
- **表**：多表订阅

---

## 27. balanceLogRepairService.ts

- **职责**：余额日志修复
- **表**：`balance_change_logs`

---

## 28. balanceLogReconcileService.ts

- **职责**：余额对账
- **表**：`balance_change_logs`, `ledger_transactions`

---

## 29. authPasswordSyncService.ts

- **职责**：员工密码与 Supabase Auth 同步
- **表**：`profiles`, `employees`；Auth API

---

## 30. userPreferencesService.ts

- **职责**：用户偏好
- **表**：`user_data_store`

---

## 31. userDataSyncService.ts

- **职责**：用户数据同步
- **表**：`user_data_store`

---

## 32. submissionErrorService.ts

- **职责**：提交错误处理
- **表**：无

---

## 33. appInitializer.ts

- **职责**：应用启动初始化（默认共享数据、积分设置、复制设置、缓存）
- **表**：`shared_data_store`（通过 ensureDefaultSharedData）
