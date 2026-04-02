-- =============================================
-- Cold-Start Seed Migration
-- Seeds essential reference data for new accounts
-- =============================================

-- Part 1: Admin Role Permissions
-- Copy all existing staff/manager permission entries and grant admin full access
INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
SELECT DISTINCT
  'admin'::app_role,
  module_name,
  field_name,
  true,  -- can_view: always true for admin
  true,  -- can_edit: always true for admin
  true   -- can_delete: always true for admin
FROM role_permissions
WHERE role IN ('staff', 'manager')
ON CONFLICT DO NOTHING;

-- Part 2: Ensure admin has all navigation permissions explicitly
INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
VALUES
  ('admin', 'navigation', 'dashboard', true, true, true),
  ('admin', 'navigation', 'exchange_rate', true, true, true),
  ('admin', 'navigation', 'orders', true, true, true),
  ('admin', 'navigation', 'members', true, true, true),
  ('admin', 'navigation', 'merchant_management', true, true, true),
  ('admin', 'navigation', 'merchant_settlement', true, true, true),
  ('admin', 'navigation', 'employees', true, true, true),
  ('admin', 'navigation', 'reports', true, true, true),
  ('admin', 'navigation', 'audit_center', true, true, true),
  ('admin', 'navigation', 'operation_logs', true, true, true),
  ('admin', 'navigation', 'system_settings', true, true, true),
  ('admin', 'orders', 'card_type', true, true, true),
  ('admin', 'orders', 'card_value', true, true, true),
  ('admin', 'orders', 'card_rate', true, true, true),
  ('admin', 'orders', 'actual_payment', true, true, true),
  ('admin', 'orders', 'exchange_rate', true, true, true),
  ('admin', 'orders', 'fee', true, true, true),
  ('admin', 'orders', 'currency', true, true, true),
  ('admin', 'orders', 'phone_number', true, true, true),
  ('admin', 'orders', 'payment_provider', true, true, true),
  ('admin', 'orders', 'vendor', true, true, true),
  ('admin', 'orders', 'remark', true, true, true),
  ('admin', 'orders', 'member_code', true, true, true),
  ('admin', 'orders', 'sales_person', true, true, true),
  ('admin', 'orders', 'cancel_button', true, true, true),
  ('admin', 'orders', 'delete_button', true, true, true),
  ('admin', 'members', 'phone_number', true, true, true),
  ('admin', 'members', 'member_level', true, true, true),
  ('admin', 'members', 'common_cards', true, true, true),
  ('admin', 'members', 'bank_card', true, true, true),
  ('admin', 'members', 'currency_preferences', true, true, true),
  ('admin', 'members', 'customer_feature', true, true, true),
  ('admin', 'members', 'source', true, true, true),
  ('admin', 'members', 'remark', true, true, true),
  ('admin', 'members', 'referrer', true, true, true),
  ('admin', 'members', 'recorder', true, true, true),
  ('admin', 'members', 'member_code', true, true, true),
  ('admin', 'members', 'points', true, true, true),
  ('admin', 'members', 'delete_button', true, true, true),
  ('admin', 'activity', 'currency', true, true, true),
  ('admin', 'activity', 'amount', true, true, true),
  ('admin', 'activity', 'rate', true, true, true),
  ('admin', 'activity', 'phone_number', true, true, true),
  ('admin', 'activity', 'payment_agent', true, true, true),
  ('admin', 'activity', 'gift_type', true, true, true),
  ('admin', 'activity', 'remark', true, true, true),
  ('admin', 'activity', 'delete_button', true, true, true),
  ('admin', 'dashboard', 'own_data_only', true, true, true),
  ('admin', 'audit', 'can_approve', true, true, true),
  ('admin', 'audit', 'require_approval', true, true, true)
ON CONFLICT DO NOTHING;

-- Part 3: Seed default activity types (if table exists and empty)
INSERT INTO activity_types (value, label, is_active, sort_order)
VALUES
  ('activity_1', '活动1', true, 1),
  ('activity_2', '活动2', true, 2)
ON CONFLICT (value) DO NOTHING;