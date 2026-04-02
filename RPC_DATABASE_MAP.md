# RPC → 数据库表映射 (RPC-Database Map)

## 说明

RPC 函数内部会读写多张表，本表列出主要涉及的表。

---

## 租户与员工

| RPC | 主要涉及表 |
|-----|------------|
| `get_my_tenant_id` | profiles, employees |
| `get_my_employee_info` | profiles, employees |
| `get_my_tenant_employees_full` | employees, tenants |
| `platform_get_tenant_employees_full` | employees, tenants |
| `verify_employee_login` | employees |
| `verify_employee_login_detailed` | employees, profiles, tenants |
| `log_employee_login` | employee_login_logs |
| `signup_employee` | employees, profiles, invitation_codes |
| `admin_reset_password` | employees |
| `create_tenant_with_admin` | tenants, employees |
| `check_tenant_create_conflicts` | tenants, employees |
| `delete_tenant` | tenants, employees, members, orders, ... |
| `tenant_delete_employee` | employees |
| `platform_delete_employee` | employees |
| `list_tenants_for_platform_admin` | tenants, employees |
| `update_tenant_basic_info` | tenants |
| `reset_tenant_admin_password` | employees, tenants |
| `get_active_employees_safe` | employees |
| `get_active_visible_employees_safe` | employees |
| `has_role` | employees |
| `can_modify_name` | employees |

---

## 共享数据与会员

| RPC | 主要涉及表 |
|-----|------------|
| `get_shared_data_for_my_tenant` | shared_data_store |
| `upsert_shared_data_for_my_tenant` | shared_data_store |
| `get_member_by_phone_for_my_tenant` | members, employees |

---

## 订单与报表

| RPC | 主要涉及表 |
|-----|------------|
| `get_my_tenant_orders_full` | orders |
| `get_my_tenant_usdt_orders_full` | orders |
| `get_my_tenant_members_full` | members |
| `platform_get_tenant_orders_full` | orders |
| `platform_get_tenant_usdt_orders_full` | orders |
| `platform_get_tenant_members_full` | members |
| `platform_get_tenant_overview` | orders, members, employees |
| `platform_get_dashboard_trend_data` | orders |
| `get_dashboard_trend_data` | orders |
| `get_order_filter_stats` | orders |
| `get_my_tenant_dashboard_trend` | orders |

---

## 会员端

| RPC | 主要涉及表 |
|-----|------------|
| `member_check_in` | member_spin_credits, member_spin_logs |
| `member_check_in_today` | member_spin_credits |
| `member_spin` | member_spin_credits, member_spin_logs, member_spin_rewards |
| `member_redeem_prize` | member_spin_rewards, member_spin_logs |
| `member_get_points` | points_accounts, points_ledger |
| `member_get_spin_quota` | member_spin_credits |
| `member_grant_spin_for_share` | member_spin_credits |
| `member_get_spins` | member_spin_logs |
| `member_update_nickname` | members |
| `member_get_info` | members |
| `verify_member_password` | members |
| `set_member_password` | members |
| `admin_set_member_initial_password` | members |
| `validate_invite_and_submit` | invitation_codes, members, referral_relations |

---

## 积分与账本

| RPC | 主要涉及表 |
|-----|------------|
| `calculate_member_points` | points_ledger |
| `redeem_points_and_record` | points_ledger, points_accounts, member_activity, activity_gifts |
| `create_ledger_entry` | ledger_transactions |
| `soft_delete_ledger_entry` | ledger_transactions |
| `reverse_all_entries_for_order` | ledger_transactions |
| `recompute_account_balance` | ledger_transactions |
| `set_initial_balance_entry` | ledger_transactions |

---

## 活动礼品

| RPC | 主要涉及表 |
|-----|------------|
| `delete_activity_gift_and_restore` | activity_gifts, points_ledger |

---

## 号码池

| RPC | 主要涉及表 |
|-----|------------|
| `phone_bulk_import` | phone_pool |
| `rpc_extract_phones` | phone_pool, phone_reservations, phone_extract_settings |
| `rpc_return_phones` | phone_pool, phone_reservations |
| `rpc_phone_stats` | phone_pool, phone_reservations |
| `rpc_clear_phone_pool` | phone_pool, phone_reservations |
| `rpc_phone_extract_settings` | phone_extract_settings |
| `rpc_phone_extract_records` | phone_reservations, phone_pool |
| `rpc_update_phone_extract_settings` | phone_extract_settings |

---

## 任务

| RPC | 主要涉及表 |
|-----|------------|
| `get_my_task_items` | task_items, tasks, task_posters |

---

## 邀请码

| RPC | 主要涉及表 |
|-----|------------|
| `generate_invitation_code` | invitation_codes |

---

## API 与 Webhook

| RPC | 主要涉及表 |
|-----|------------|
| `validate_api_key` | api_keys, api_rate_limits |
| `cleanup_expired_rate_limits` | api_rate_limits |
| `get_api_daily_stats` | api_request_logs |
| `get_api_endpoint_stats` | api_request_logs |
| `queue_webhook_event` | webhook_event_queue |

---

## 知识库

| RPC | 主要涉及表 |
|-----|------------|
| `platform_get_tenant_knowledge_categories` | knowledge_categories |
| `platform_get_tenant_knowledge_articles` | knowledge_articles |

---

## 数据归档

| RPC | 主要涉及表 |
|-----|------------|
| `archive_old_data` | orders, operation_logs, points_ledger, archived_* |
