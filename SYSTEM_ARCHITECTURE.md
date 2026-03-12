# 系统架构文档 (System Architecture Report)

> 本文档为外部架构师提供完整的系统架构概览，便于理解礼品卡/会员积分系统的设计与实现。

---

## STEP 1: 项目文件夹结构

> 已排除：`node_modules`、`dist`、`build`、`.next`

```
Cursor-huiyuanxitong-main/
├── .lovable/                    # Lovable 配置
├── .wrangler/                   # Cloudflare Wrangler 配置
├── docs/                        # 项目文档
├── electron/                    # Electron 桌面应用入口
├── public/                      # 静态资源
├── scripts/                     # 部署与迁移脚本
├── src/
│   ├── components/             # 前端组件
│   │   ├── dialogs/            # 弹窗组件
│   │   ├── empty-state/        # 空状态组件
│   │   ├── exchange-rate/      # 汇率相关组件
│   │   ├── layout/             # 布局组件
│   │   ├── layouts/            # 布局变体
│   │   ├── member/             # 会员端组件
│   │   ├── merchant-settlement/# 商户结算组件
│   │   ├── orders/             # 订单相关组件
│   │   ├── report/             # 报表组件
│   │   ├── skeletons/          # 骨架屏
│   │   └── ui/                 # 通用 UI 组件
│   ├── config/                 # 应用配置
│   ├── contexts/               # React 上下文
│   ├── hooks/                  # 自定义 Hooks
│   ├── integrations/           # 第三方集成（Supabase）
│   ├── lib/                    # 工具库
│   ├── locales/                # 国际化
│   ├── pages/                  # 页面
│   ├── services/               # 业务服务层
│   ├── stores/                 # 状态管理
│   ├── styles/                 # 样式
│   └── test/                   # 测试
├── supabase/
│   └── migrations/             # 数据库迁移（约 173 个文件）
├── .env, .env.example
├── package.json, bun.lockb
├── vite.config.ts
├── tailwind.config.ts
├── capacitor.config.ts
├── wrangler.toml
└── README.md
```

---

## STEP 2: 数据库表及字段

### 核心业务表

| 表名 | 字段 |
|------|------|
| **tenants** | id, tenant_code, tenant_name, status, admin_employee_id, created_at, updated_at |
| **employees** | id, username, real_name, password_hash, role, status, visible, is_super_admin, tenant_id, created_at, updated_at |
| **members** | id, member_code, phone_number, bank_card, common_cards, creator_id, recorder_id, source_id, member_level, currency_preferences, customer_feature, remark, created_at, updated_at |
| **orders** | id, order_number, order_type, amount, currency, status, member_id, creator_id, sales_user_id, phone_number, exchange_rate, fee, profit_ngn, profit_usdt, card_value, payment_value, actual_payment, order_points, points_status, vendor_id, card_merchant_id, member_code_snapshot, remark, completed_at, deleted_at, is_deleted, data_version, created_at, updated_at |
| **points_accounts** | id, member_code, phone, current_points, last_reset_time, current_cycle_id, points_accrual_start_time, last_updated |
| **points_ledger** | id, member_code, member_id, order_id, phone_number, points_earned, transaction_type, status, creator_id, creator_name, currency, exchange_rate, actual_payment, usd_amount, points_multiplier, created_at |
| **points_summary** | id, total_issued_points, total_reversed_points, net_points, transaction_count, last_updated |
| **member_activity** | id, member_id, phone_number, accumulated_points, remaining_points, order_count, referral_count, referral_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, total_gift_ngn, total_gift_ghs, total_gift_usdt, last_reset_time, created_at, updated_at |

### 活动与礼品

| 表名 | 字段 |
|------|------|
| **activity_gifts** | id, member_id, creator_id, phone_number, amount, currency, rate, fee, gift_value, gift_type, gift_number, payment_agent, remark, created_at |
| **activity_types** | id, value, label, sort_order, is_active, created_at, updated_at |
| **activity_reward_tiers** | id, min_points, max_points, reward_amount_usdt, reward_amount_ngn, reward_amount_ghs, sort_order, created_at, updated_at |

### 汇率与商户

| 表名 | 字段 |
|------|------|
| **exchange_rate_state** | id, form_data, user_id, updated_at |
| **currencies** | id, code, name_zh, name_en, symbol, badge_color, sort_order, is_active, created_at, updated_at |
| **card_types** | id, name, sort_order, created_at |
| **cards** | id, name, type, card_vendors, status, remark, sort_order, created_at, updated_at |
| **vendors** | id, name, payment_providers, status, remark, sort_order, created_at, updated_at |
| **payment_providers** | id, name, status, remark, sort_order, created_at, updated_at |
| **customer_sources** | id, name, is_active, sort_order, created_at, updated_at |

### 号码池（Phone Pool）

| 表名 | 字段 |
|------|------|
| **phone_pool** | id, tenant_id, raw_value, normalized, status (available/reserved/consumed), reserved_by, reserved_at, inserted_at |
| **phone_reservations** | id, phone_pool_id, user_id, action (extract/return/consume), action_at |
| **phone_extract_settings** | id, per_extract_limit, per_user_daily_limit |

### 账本与结算

| 表名 | 字段 |
|------|------|
| **ledger_transactions** | id, account_id, account_type, amount, before_balance, after_balance, source_id, source_type, reversal_of, operator_id, operator_name, note, is_active, created_at |
| **balance_change_logs** | id, merchant_name, merchant_type, change_type, change_amount, balance_before, balance_after, operator_id, operator_name, related_id, remark, created_at |

### 系统与审计

| 表名 | 字段 |
|------|------|
| **profiles** | id, employee_id, email, created_at, updated_at |
| **invitation_codes** | id, code, max_uses, used_count, is_active, created_by, expires_at, created_at |
| **referral_relations** | id, referrer_member_code, referrer_phone, referee_member_code, referee_phone, source, created_at |
| **audit_records** | id, target_table, target_id, action_type, old_data, new_data, status, submitter_id, reviewer_id, review_comment, review_time, created_at |
| **operation_logs** | id, module, operation_type, object_id, object_description, operator_id, operator_account, operator_role, before_data, after_data, ip_address, is_restored, restored_by, restored_at, timestamp |
| **employee_login_logs** | id, employee_id, success, failure_reason, ip_address, user_agent, login_method, login_time, created_at |
| **employee_permissions** | id, employee_id, permission_key, can_edit_directly, requires_approval, created_at |
| **permission_versions** | id, target_role, version_name, version_description, permissions_snapshot, created_by, created_by_name, is_auto_backup, created_at |
| **permission_change_logs** | id, action_type, target_role, template_name, before_data, after_data, changes_summary, changed_by, changed_by_name, changed_by_role, ip_address, is_rollback, rollback_to_version_id, changed_at |
| **role_permissions** | id, role, module_name, field_name, can_view, can_edit, can_delete, created_at, updated_at |

### API 与 Webhook

| 表名 | 字段 |
|------|------|
| **api_keys** | id, key_hash, key_prefix, name, permissions, rate_limit, status, ip_whitelist, expires_at, created_by, total_requests, last_used_at, remark, created_at, updated_at |
| **api_rate_limits** | id, api_key_id, window_start, request_count |
| **api_request_logs** | id, api_key_id, key_prefix, endpoint, method, response_status, response_time_ms, ip_address, user_agent, request_params, error_message, created_at |
| **webhooks** | id, url, events, secret, status, created_at, updated_at |
| **webhook_event_queue** | id, event_type, payload, status, retry_count, max_retries, next_retry_at, processed_at, created_at |
| **webhook_delivery_logs** | id, webhook_id, event_type, payload, success, response_status, response_body, response_time_ms, error_message, attempt_count, created_at |

### 知识库与任务

| 表名 | 字段 |
|------|------|
| **knowledge_categories** | id, name, content_type, visibility, is_active, sort_order, created_by, created_at, updated_at |
| **knowledge_articles** | id, category_id, title_zh, title_en, content, description, image_url, visibility, is_published, sort_order, created_by, created_at, updated_at |
| **knowledge_read_status** | id, article_id, employee_id, read_at |
| **shared_data_store** | id, data_key, data_value, created_at, updated_at |
| **user_data_store** | id, user_id, data_key, data_value, created_at, updated_at |
| **shift_handovers** | id, handover_employee_id, handover_employee_name, handover_time, receiver_name, card_merchant_data, payment_provider_data, remark, created_at |
| **shift_receivers** | id, name, sort_order, creator_id, created_at, updated_at |

### 数据管理

| 表名 | 字段 |
|------|------|
| **data_backups** | id, backup_name, trigger_type, status, tables_backed_up, record_counts, total_size_bytes, storage_path, created_by, created_by_name, error_message, completed_at, created_at |
| **data_settings** | id, setting_key, setting_value, updated_at |
| **archive_runs** | id, run_at, status, tables_processed, records_archived, records_deleted, duration_ms, error_message, triggered_by |
| **archived_orders** | id, original_id, original_data, archived_at, order_number, order_type, amount, currency, status, ... |
| **archived_operation_logs** | id, original_id, original_data, archived_at, module, operation_type, operator_account, operator_role, timestamp |
| **archived_points_ledger** | id, original_id, original_data, archived_at, member_code, phone_number, points_earned, transaction_type, created_at |

### 其他

| 表名 | 字段 |
|------|------|
| **report_titles** | id, report_key, title_zh, title_en, updated_at |
| **navigation_config** | id, nav_key, display_text_zh, display_text_en, is_visible, sort_order, updated_at |
| **notifications** | id, recipient_id, type, category, title, message, link, metadata, is_read, created_at |
| **risk_events** | id, event_type, severity, score, details, employee_id, resolved, resolved_by, resolved_at, created_at |
| **risk_scores** | id, employee_id, current_score, risk_level, factors, auto_action_taken, last_calculated_at, updated_at |
| **error_reports** | id, employee_id, error_message, error_stack, component_stack, url, user_agent, created_at |
| **web_vitals** | id, employee_id, metric_name, metric_value, rating, url, navigation_type, user_agent, created_at |
| **employee_name_history** | id, employee_id, old_name, new_name, changed_by, reason, changed_at |

---

## STEP 3: RPC 函数与存储过程

### 租户与员工

| 函数名 | 用途 |
|--------|------|
| `get_my_tenant_id()` | 获取当前用户所属租户 ID |
| `get_my_tenant_employees_full()` | 获取当前租户下所有员工 |
| `platform_get_tenant_employees_full(p_tenant_id)` | 平台管理员获取指定租户员工 |
| `get_active_employees_safe(p_tenant_id?)` | 获取活跃员工列表 |
| `get_active_visible_employees_safe(p_tenant_id?)` | 获取可见活跃员工 |
| `get_my_employee_info()` | 获取当前员工信息 |
| `verify_employee_login(p_username, p_password)` | 员工登录验证 |
| `verify_employee_login_detailed(p_username, p_password)` | 员工登录验证（含 tenant_id、is_super_admin） |
| `log_employee_login(...)` | 记录登录日志 |
| `signup_employee(...)` | 员工注册 |
| `admin_reset_password(...)` | 管理员重置员工密码 |
| `create_tenant_with_admin(...)` | 创建租户及管理员 |
| `check_tenant_create_conflicts(...)` | 检查租户创建冲突 |
| `delete_tenant(p_tenant_id)` | 删除租户 |
| `tenant_delete_employee(p_employee_id)` | 删除员工 |
| `set_tenant_super_admin(p_employee_id)` | 设置租户超级管理员 |
| `is_platform_super_admin(p_user_id)` | 判断是否为平台超级管理员 |
| `get_employee_id(_user_id)` | 根据 user_id 获取 employee_id |
| `has_role(_user_id, _role)` | 判断用户角色 |
| `can_modify_name(_employee_id, _modifier_id)` | 判断是否可修改名称 |

### 共享数据与会员

| 函数名 | 用途 |
|--------|------|
| `get_shared_data_for_my_tenant(p_data_key)` | 获取租户共享数据 |
| `upsert_shared_data_for_my_tenant(p_data_key, p_data_value)` | 写入/更新租户共享数据 |
| `get_member_by_phone_for_my_tenant(p_phone)` | 按手机号查询会员 |

### 订单与报表

| 函数名 | 用途 |
|--------|------|
| `get_my_tenant_orders_full()` | 获取当前租户订单 |
| `get_my_tenant_usdt_orders_full()` | 获取当前租户 USDT 订单 |
| `platform_get_tenant_orders_full(p_tenant_id)` | 平台获取指定租户订单 |
| `platform_get_tenant_usdt_orders_full(p_tenant_id)` | 平台获取指定租户 USDT 订单 |
| `get_order_filter_stats(...)` | 订单筛选统计 |
| `get_dashboard_trend_data(p_start_date, p_end_date, p_sales_person?)` | 仪表盘趋势数据 |
| `platform_get_dashboard_trend_data(p_tenant_id, ...)` | 平台仪表盘趋势 |
| `platform_get_tenant_overview(p_tenant_id)` | 平台租户概览 |

### 会员与会员端

| 函数名 | 用途 |
|--------|------|
| `get_my_tenant_members_full()` | 获取当前租户会员 |
| `platform_get_tenant_members_full(p_tenant_id)` | 平台获取指定租户会员 |
| `member_check_in(p_member_id)` | 会员签到 |
| `member_spin(p_member_id, p_source)` | 会员抽奖 |
| `member_redeem_prize(p_member_id, p_prize_id)` | 会员兑换奖品 |
| `member_get_points(p_member_id)` | 获取会员积分 |
| `member_get_spin_quota(p_member_id)` | 获取会员抽奖次数 |
| `member_grant_spin_for_share(p_member_id)` | 分享赠送抽奖次数 |
| `grant_invite_bonus_spins(p_inviter_id, p_invitee_id)` | 邀请奖励抽奖 |
| `grant_invitee_spins(p_member_id, p_phone)` | 被邀请人奖励 |
| `validate_invite_and_submit(p_code, p_invitee_phone)` | 验证邀请码并提交 |
| `admin_set_member_initial_password(p_member_id, p_new_password)` | 管理员设置会员初始密码 |
| `verify_member_password(p_phone, p_password)` | 验证会员密码 |
| `set_member_password(p_member_id, p_old, p_new)` | 会员修改密码 |

### 积分与账本

| 函数名 | 用途 |
|--------|------|
| `calculate_member_points(p_member_code, p_last_reset_time?)` | 计算会员积分 |
| `redeem_points_and_record(...)` | 积分兑换并记录 |
| `create_ledger_entry(...)` | 创建账本分录 |
| `soft_delete_ledger_entry(...)` | 软删除账本分录 |
| `reverse_all_entries_for_order(...)` | 订单冲销 |
| `recompute_account_balance(p_account_id, p_account_type)` | 重算账户余额 |
| `set_initial_balance_entry(...)` | 设置初始余额 |

### 活动礼品

| 函数名 | 用途 |
|--------|------|
| `delete_activity_gift_and_restore(p_gift_id)` | 删除活动礼品并恢复 |

### 号码池

| 函数名 | 用途 |
|--------|------|
| `normalize_phone(raw)` | 手机号标准化 |
| `phone_bulk_import(p_tenant_id, lines)` | 批量导入号码 |
| `rpc_extract_phones(p_tenant_id, p_limit_count)` | 提取号码 |
| `rpc_return_phones(phone_ids)` | 归还号码 |
| `rpc_phone_stats(p_tenant_id)` | 号码池统计 |
| `rpc_clear_phone_pool(p_tenant_id)` | 清空号码池 |
| `rpc_phone_extract_settings()` | 获取提取配置 |
| `rpc_update_phone_extract_settings(...)` | 更新提取配置 |
| `rpc_phone_extract_records(p_tenant_id, p_limit)` | 获取提取记录 |

### 任务

| 函数名 | 用途 |
|--------|------|
| `get_my_task_items()` | 获取当前用户任务项 |

### 邀请码

| 函数名 | 用途 |
|--------|------|
| `generate_invitation_code(p_creator_id?, p_expires_at?, p_max_uses?)` | 生成邀请码 |

### API 与 Webhook

| 函数名 | 用途 |
|--------|------|
| `validate_api_key(p_key_hash, p_endpoint, p_ip_address)` | 验证 API Key |
| `cleanup_expired_rate_limits()` | 清理过期限流 |
| `get_api_daily_stats(p_days?)` | API 每日统计 |
| `get_api_endpoint_stats(p_days?)` | API 端点统计 |
| `queue_webhook_event(p_event_type, p_payload)` | 入队 Webhook 事件 |

### 数据归档

| 函数名 | 用途 |
|--------|------|
| `archive_old_data(retention_days?)` | 归档旧数据 |

---

## STEP 4: 主要前端页面与组件

### 页面 (src/pages)

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Dashboard | 仪表盘 |
| `/login` | Login | 员工登录 |
| `/signup` | Signup | 员工注册 |
| `/members` | MemberManagement | 会员管理 |
| `/orders` | OrderManagement | 订单管理 |
| `/employees` | EmployeeManagement | 员工管理 |
| `/exchange-rate` | ExchangeRate | 汇率设置 |
| `/settings` | SystemSettings | 系统设置 |
| `/customer-query` | CustomerQuery | 客户查询 |
| `/merchants` | MerchantManagement | 商户管理 |
| `/merchant-settlement` | MerchantSettlement | 商户结算 |
| `/activity-reports` | ActivityReports | 活动报表 |
| `/member-activity` | MemberActivityData | 会员活动数据 |
| `/reports` | ReportManagement | 报表管理 |
| `/operation-logs` | OperationLogs | 操作日志 |
| `/login-logs` | LoginLogs | 登录日志 |
| `/audit-center` | AuditCenter | 审计中心 |
| `/pending-authorization` | PendingAuthorization | 待授权 |
| `/knowledge` | KnowledgeBase | 知识库 |
| `/admin/tenants` | CompanyManagement | 公司/租户管理 |
| `/admin/tenant-view` | PlatformTenantView | 平台租户视图 |
| `/admin/settings/:tab` | PlatformSettingsPage | 平台设置 |
| `/tasks/settings` | TasksSettings | 任务设置 |
| `/tasks/history` | TasksHistory | 任务历史 |
| `/tasks/posters` | TasksPosters | 任务海报 |
| `/tasks/phone-extract` | TasksPhoneExtract | 号码提取 |
| `/public-rates` | PublicRates | 公开汇率 |
| `/member/login` | MemberLogin | 会员登录 |
| `/member/dashboard` | MemberDashboard | 会员仪表盘 |
| `/member/spin` | MemberSpin | 会员抽奖 |
| `/member/points` | MemberPoints | 会员积分 |
| `/member/invite` | MemberInvite | 会员邀请 |
| `/member/settings` | MemberSettings | 会员设置 |
| `/invite/:code` | InviteLanding | 邀请落地页 |
| `/404` | NotFound | 404 页面 |

### 主要组件 (src/components)

| 组件 | 说明 |
|------|------|
| **布局** | MainLayout, AdminLayout, MemberLayout, Sidebar, AdminSidebar, Header, AdminHeader, MobileLayout, MobileMenu |
| **路由与权限** | ProtectedRoute, AdminProtectedRoute, MemberProtectedRoute, AppRouter |
| **订单** | OrderFilters, OrderManagementContent |
| **会员** | MemberManagementContent, MemberActivityDataContent, MemberBottomNav |
| **汇率** | RateSettingsTab, UsdtRatePanel, RateCalculator, RatePosterGenerator |
| **商户结算** | PaymentProviderSettlementTab, CardMerchantSettlementTab |
| **号码池** | PhoneExtractPanel, PhoneExtractSettingsSection |
| **数据** | DataBackupTab, DataArchiveTab, DataManagementTab, DataExportImportTab, DataRepairTab |
| **系统** | ApiManagementTab, ApiKeyManagementTab, ApiStatsDashboard, ApiDocumentationTab |
| **设置** | SystemSettings 各 Tab（CurrencySettingsTab, PointsSettingsTab, GiftDistributionSettingsTab, PermissionSettingsTab, CustomerSourceSettingsTab, CopySettingsTab 等） |
| **其他** | DashboardSummary, EmployeeLeaderboard, CustomerDetailHoverCard, GlobalSearch, TenantViewBanner, TopProgressBar, UpdatePrompt, ErrorBoundary |

---

## STEP 5: 与数据库通信的服务

| 服务文件 | 用途 |
|----------|------|
| **phonePoolService** | 号码池：提取、归还、批量导入、统计 |
| **tenantService** | 租户：创建、删除、查询 |
| **exchangeService** | 汇率：读写、同步 |
| **pointsService** | 积分：查询、兑换 |
| **pointsCalculationService** | 积分计算逻辑 |
| **settlementCalculationService** | 商户结算计算 |
| **ledgerTransactionService** | 账本交易 |
| **memberLookupService** | 会员查询 |
| **sharedDataService** | 共享数据读写 |
| **dataBackupService** | 数据备份 |
| **dataArchiveService** | 数据归档 |
| **webhookService** | Webhook 发送 |
| **taskService** | 任务管理 |
| **balanceLogService** | 余额变动日志 |
| **balanceLogRepairService** | 余额日志修复 |
| **balanceLogReconcileService** | 余额对账 |
| **customerDetailService** | 客户详情 |
| **operatorService** | 操作员解析 |
| **nameResolver** | 姓名解析 |
| **dataExportImportService** | 数据导入导出 |
| **export/** | 导出/导入（订单、会员等） |
| **appInitializer** | 应用初始化 |
| **authPasswordSyncService** | 密码同步 |
| **cacheManager** | 缓存管理 |
| **databaseMigrationService** | 数据库迁移 |
| **orderAnomalyDetection** | 订单异常检测 |
| **riskScoringService** | 风险评分 |
| **resourceMonitorService** | 资源监控 |
| **realtimeManager** | 实时订阅 |
| **userPreferencesService** | 用户偏好 |
| **userDataSyncService** | 用户数据同步 |
| **webVitalsService** | Web 性能指标 |
| **submissionErrorService** | 提交错误处理 |

---

## STEP 6: 核心业务模块说明

### 订单系统 (Orders)
管理礼品卡/充值卡交易订单，支持多币种（USDT、NGN、GHS）、多支付渠道，记录金额、汇率、手续费、利润，并与会员、积分、账本联动。

### 会员系统 (Members)
以手机号为核心标识的会员管理，支持会员码、来源、等级、常用卡种等，与订单、积分、邀请、抽奖等模块关联。

### 租户系统 (Tenants)
多租户隔离，每个租户有独立管理员、员工、会员、订单、号码池等数据，平台超级管理员可跨租户查看与管理。

### 积分系统 (Points)
会员通过订单获得积分，支持周期重置、兑换礼品、积分账本（points_ledger）与汇总（points_summary、member_activity）。

### 号码池系统 (Phone Pool)
按租户隔离的号码池，支持批量导入、提取、归还、消耗，用于电销/外呼等场景，有每日提取限制与配置。

### 活动与礼品系统 (Activity & Gifts)
活动类型、奖励档位、礼品发放记录（activity_gifts），与积分兑换、会员活动数据（member_activity）联动。

### 抽奖系统 (Spin)
会员签到、分享、邀请可获得抽奖次数，通过 member_spin 等 RPC 完成抽奖与奖品兑换。

### 商户结算系统 (Merchant Settlement)
基于订单与账本（ledger_transactions、balance_change_logs）的商户/支付渠道结算与对账。

### 汇率系统 (Exchange Rate)
多币种汇率配置（exchange_rate_state、currencies），影响订单金额、利润、积分换算。

### 审计与权限系统 (Audit & Permissions)
操作日志、审计记录、角色权限、员工权限、权限变更历史，支持审批流程与回滚。

### API 与 Webhook
API Key 管理、限流、请求日志，以及 Webhook 事件队列与投递日志。

### 知识库 (Knowledge Base)
分类与文章管理，支持阅读状态，用于内部培训与文档。

### 任务系统 (Tasks)
任务项、海报存储、号码提取等，与号码池、共享数据配合使用。

---

## 技术栈概览

- **前端**: React + TypeScript + Vite + Tailwind CSS
- **状态**: Zustand
- **后端/数据库**: Supabase (PostgreSQL)
- **部署**: Cloudflare Pages / Electron
- **PWA**: Workbox

---

*文档生成日期：2025-03-12*
