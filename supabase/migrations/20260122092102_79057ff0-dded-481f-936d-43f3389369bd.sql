-- 将所有 staff 角色权限设为默认开启
UPDATE role_permissions
SET can_view = true, can_edit = true, can_delete = true
WHERE role = 'staff';

-- 将所有 manager 角色权限设为默认开启
UPDATE role_permissions
SET can_view = true, can_edit = true, can_delete = true
WHERE role = 'manager';

-- 插入审核模块权限记录（如果不存在）
INSERT INTO role_permissions (role, module_name, field_name, can_view, can_edit, can_delete)
VALUES 
  ('staff', 'audit', 'can_approve', true, true, false),
  ('staff', 'audit', 'require_approval', true, true, false),
  ('manager', 'audit', 'can_approve', true, true, false),
  ('manager', 'audit', 'require_approval', true, true, false)
ON CONFLICT (role, module_name, field_name) 
DO UPDATE SET can_view = true, can_edit = true;