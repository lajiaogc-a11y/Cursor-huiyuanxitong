-- 1. 租户列表：平台管理租户显示总管理员账号姓名
-- 2. 员工删除：platform_delete_employee 完整处理所有 FK 引用

-- ========== 1. 修复 list_tenants_for_platform_admin：平台租户显示总管理员 ==========
CREATE OR REPLACE FUNCTION public.list_tenants_for_platform_admin()
RETURNS TABLE(
  id uuid,
  tenant_code text,
  tenant_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  admin_employee_id uuid,
  admin_username text,
  admin_real_name text,
  admin_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.tenant_code,
    t.tenant_name,
    t.status,
    t.created_at,
    t.updated_at,
    CASE WHEN t.tenant_code = 'platform' THEN COALESCE(t.admin_employee_id, plat.id) ELSE t.admin_employee_id END AS admin_employee_id,
    CASE WHEN t.tenant_code = 'platform' THEN COALESCE(ea.username, plat.username) ELSE ea.username END AS admin_username,
    CASE WHEN t.tenant_code = 'platform' THEN COALESCE(ea.real_name, plat.real_name) ELSE ea.real_name END AS admin_real_name,
    (SELECT count(*)::bigint FROM public.employees e WHERE e.tenant_id = t.id AND e.role = 'admin') AS admin_count
  FROM public.tenants t
  LEFT JOIN public.employees ea ON ea.id = t.admin_employee_id
  LEFT JOIN LATERAL (
    SELECT e.id, e.username, e.real_name
    FROM public.employees e
    WHERE e.tenant_id = t.id AND e.is_super_admin = true
    LIMIT 1
  ) plat ON t.tenant_code = 'platform'
  ORDER BY t.tenant_code;
END;
$fn$;

-- ========== 2. 增强 platform_delete_employee：完整处理 FK 引用后再删除 ==========
CREATE OR REPLACE FUNCTION public.platform_delete_employee(p_employee_id uuid)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_target_tenant_id uuid;
BEGIN
  -- 仅平台总管理员可调用
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text;
    RETURN;
  END IF;

  -- 检查目标员工是否存在
  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id) THEN
    RETURN QUERY SELECT false, 'EMPLOYEE_NOT_FOUND'::text;
    RETURN;
  END IF;

  SELECT tenant_id INTO v_target_tenant_id FROM employees WHERE id = p_employee_id LIMIT 1;

  -- 解除 profiles 对目标员工的引用
  UPDATE profiles SET employee_id = null WHERE employee_id = p_employee_id;

  -- 解除 tenants 对目标员工的引用
  UPDATE tenants SET admin_employee_id = null WHERE admin_employee_id = p_employee_id;

  -- 解除/删除所有引用该员工的业务数据（按 FK 依赖顺序）
  UPDATE operation_logs SET restored_by = null WHERE restored_by = p_employee_id;
  DELETE FROM operation_logs WHERE operator_id = p_employee_id;

  UPDATE audit_records SET reviewer_id = null WHERE reviewer_id = p_employee_id;
  UPDATE audit_records SET submitter_id = null WHERE submitter_id = p_employee_id;

  UPDATE employee_name_history SET changed_by = null WHERE changed_by = p_employee_id;

  UPDATE members SET creator_id = null WHERE creator_id = p_employee_id;
  UPDATE members SET recorder_id = null WHERE recorder_id = p_employee_id;

  UPDATE orders SET creator_id = null WHERE creator_id = p_employee_id;
  UPDATE orders SET sales_user_id = null WHERE sales_user_id = p_employee_id;

  UPDATE activity_gifts SET creator_id = null WHERE creator_id = p_employee_id;

  UPDATE points_ledger SET creator_id = null WHERE creator_id = p_employee_id;

  BEGIN
    UPDATE balance_change_logs SET operator_id = null WHERE operator_id = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE ledger_transactions SET operator_id = null WHERE operator_id = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;

  BEGIN
    DELETE FROM api_keys WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM data_backups WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE invitation_codes SET created_by = null WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE knowledge_articles SET created_by = null WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE knowledge_categories SET created_by = null WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM permission_change_logs WHERE changed_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE permission_versions SET created_by = null WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM risk_events WHERE employee_id = p_employee_id OR resolved_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM risk_scores WHERE employee_id = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM shift_handovers WHERE handover_employee_id = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    DELETE FROM shift_receivers WHERE creator_id = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;
  BEGIN
    UPDATE webhooks SET created_by = null WHERE created_by = p_employee_id;
  EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
  END;

  -- 删除员工（CASCADE 会处理 employee_login_logs, employee_permissions, knowledge_read_status 等）
  DELETE FROM employees WHERE id = p_employee_id;

  RETURN QUERY SELECT true, null::text;
EXCEPTION WHEN others THEN
  RETURN QUERY SELECT false, 'DELETE_FAILED'::text;
END;
$fn$;
