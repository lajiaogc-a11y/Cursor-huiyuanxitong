-- =============================================
-- 修复汇率计算权限不足
-- 确保 staff 和 manager 角色拥有 navigation.exchange_rate 的 can_view 权限
-- =============================================
DO $$
BEGIN
  UPDATE role_permissions SET can_view=true, can_edit=true, can_delete=true, updated_at=now()
  WHERE module_name='navigation' AND field_name='exchange_rate' AND role::text IN ('staff','manager');
  INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
  SELECT r::app_role, 'navigation', 'exchange_rate', true, true, true
  FROM (VALUES ('staff'),('manager')) AS t(r)
  WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role::text=t.r AND module_name='navigation' AND field_name='exchange_rate');
END $$;
