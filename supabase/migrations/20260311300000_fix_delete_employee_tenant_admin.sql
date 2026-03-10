-- 修复租户管理员删除员工失败：直接 delete employees 会违反 FK 约束
-- 新增 tenant_delete_employee RPC，供租户 admin/manager 删除本租户员工时使用（完整处理 FK）

CREATE OR REPLACE FUNCTION public.tenant_delete_employee(p_employee_id uuid)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller_tenant_id uuid;
  v_target_tenant_id uuid;
BEGIN
  -- 获取当前用户的租户
  SELECT e.tenant_id INTO v_caller_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
  LIMIT 1;

  IF v_caller_tenant_id IS NULL THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text;
    RETURN;
  END IF;

  -- 仅租户 admin 或 manager 可调用
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text;
    RETURN;
  END IF;

  -- 检查目标员工是否存在且属于同一租户
  SELECT tenant_id INTO v_target_tenant_id FROM employees WHERE id = p_employee_id LIMIT 1;
  IF v_target_tenant_id IS NULL THEN
    RETURN QUERY SELECT false, 'EMPLOYEE_NOT_FOUND'::text;
    RETURN;
  END IF;
  IF v_target_tenant_id != v_caller_tenant_id THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text;
    RETURN;
  END IF;

  -- 不能删除总管理员（需平台总管理员操作）
  IF EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id AND is_super_admin = true) THEN
    RETURN QUERY SELECT false, 'CANNOT_DELETE_SUPER_ADMIN'::text;
    RETURN;
  END IF;

  -- 解除 profiles 对目标员工的引用
  UPDATE profiles SET employee_id = null WHERE employee_id = p_employee_id;

  -- 解除 tenants 对目标员工的引用
  UPDATE tenants SET admin_employee_id = null WHERE admin_employee_id = p_employee_id;

  -- 解除/删除所有引用该员工的业务数据（与 platform_delete_employee 相同）
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

  DELETE FROM employees WHERE id = p_employee_id;

  RETURN QUERY SELECT true, null::text;
EXCEPTION WHEN others THEN
  RETURN QUERY SELECT false, 'DELETE_FAILED'::text;
END;
$fn$;
