-- 确保 staff 和 manager 能查看公司文档（导航 + 模块权限）
-- 解决：数据库有数据但员工账号登录看不到
DO $$
BEGIN
  -- 1. 导航权限：staff/manager 可看到「公司文档」菜单
  UPDATE role_permissions SET can_view=true, can_edit=true, can_delete=true, updated_at=now()
  WHERE module_name='navigation' AND field_name='knowledge_base' AND role::text IN ('staff','manager');
  INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
  SELECT r::app_role, 'navigation', 'knowledge_base', true, true, true
  FROM (VALUES ('staff'),('manager')) AS t(r)
  WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role::text=t.r AND module_name='navigation' AND field_name='knowledge_base');

  -- 2. 公司文档模块：staff/manager 可查看文章
  UPDATE role_permissions SET can_view=true, updated_at=now()
  WHERE module_name='knowledge_base' AND field_name='view_articles' AND role::text IN ('staff','manager');
  INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
  SELECT r::app_role, 'knowledge_base', 'view_articles', true, false, false
  FROM (VALUES ('staff'),('manager')) AS t(r)
  WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role::text=t.r AND module_name='knowledge_base' AND field_name='view_articles');
END $$;
