-- 修复：将曾被错误迁移到 002 的数据恢复或删除
-- 背景：20260310140000 迁移曾将其他租户(003/004/005)的普通员工错误改到 002
-- 逻辑：1) 能归属到现有租户的 → 移回  2) 原租户已删除、无法归属的 → 删除该员工及其订单/会员

CREATE OR REPLACE FUNCTION public.repair_tenant_002_wrong_assignments(
  p_dry_run boolean DEFAULT true,
  p_delete_orphans boolean DEFAULT true
)
RETURNS TABLE(
  action text,
  employee_id uuid,
  employee_name text,
  detail text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_002_admin_id uuid;
  v_tenant record;
  v_orphan_ids uuid[];
  v_member_ids uuid[];
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RAISE EXCEPTION '仅平台超级管理员可执行';
  END IF;

  SELECT id, admin_employee_id INTO v_002_id, v_002_admin_id
  FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN
    RETURN;
  END IF;

  -- ========== 1. 移回：能归属到现有租户的员工 ==========
  FOR v_tenant IN
    SELECT t.id, t.tenant_code, t.created_at
    FROM public.tenants t
    WHERE t.tenant_code NOT IN ('002', 'platform')
      AND t.admin_employee_id IS NOT NULL
  LOOP
    RETURN QUERY
    SELECT
      'move_back'::text AS action,
      e.id AS employee_id,
      e.real_name AS employee_name,
      ('移回租户 ' || v_tenant.tenant_code)::text AS detail
    FROM public.employees e
    WHERE e.tenant_id = v_002_id
      AND e.id != v_002_admin_id
      AND (
        (EXISTS (SELECT 1 FROM public.orders o WHERE (o.creator_id = e.id OR o.sales_user_id = e.id) AND o.created_at >= v_tenant.created_at)
         AND NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE (o2.creator_id = e.id OR o2.sales_user_id = e.id) AND o2.created_at < v_tenant.created_at))
        OR
        (EXISTS (SELECT 1 FROM public.members m WHERE (m.creator_id = e.id OR m.recorder_id = e.id) AND m.created_at >= v_tenant.created_at)
         AND NOT EXISTS (SELECT 1 FROM public.members m2 WHERE (m2.creator_id = e.id OR m2.recorder_id = e.id) AND m2.created_at < v_tenant.created_at))
      );
  END LOOP;

  -- ========== 2. 孤儿：无法归属到任何现有租户（原租户已删除）→ 将删除 ==========
  -- 仅当存在其他租户时才识别孤儿；排除 002 原始员工（有订单/会员早于任一其他租户创建时间）
  SELECT array_agg(e.id) INTO v_orphan_ids
  FROM public.employees e
  WHERE e.tenant_id = v_002_id
    AND e.id != v_002_admin_id
    AND EXISTS (SELECT 1 FROM public.tenants WHERE tenant_code NOT IN ('002', 'platform'))
    AND NOT EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.tenant_code NOT IN ('002', 'platform') AND t.admin_employee_id IS NOT NULL
        AND (
          (EXISTS (SELECT 1 FROM public.orders o WHERE (o.creator_id = e.id OR o.sales_user_id = e.id) AND o.created_at >= t.created_at)
           AND NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE (o2.creator_id = e.id OR o2.sales_user_id = e.id) AND o2.created_at < t.created_at))
          OR
          (EXISTS (SELECT 1 FROM public.members m WHERE (m.creator_id = e.id OR m.recorder_id = e.id) AND m.created_at >= t.created_at)
           AND NOT EXISTS (SELECT 1 FROM public.members m2 WHERE (m2.creator_id = e.id OR m2.recorder_id = e.id) AND m2.created_at < t.created_at))
        )
    )
    AND NOT (
      EXISTS (SELECT 1 FROM public.tenants t2 WHERE t2.tenant_code NOT IN ('002', 'platform')
        AND (EXISTS (SELECT 1 FROM public.orders o WHERE (o.creator_id = e.id OR o.sales_user_id = e.id) AND o.created_at < t2.created_at)
             OR EXISTS (SELECT 1 FROM public.members m WHERE (m.creator_id = e.id OR m.recorder_id = e.id) AND m.created_at < t2.created_at)))
    );

  IF v_orphan_ids IS NOT NULL AND array_length(v_orphan_ids, 1) > 0 THEN
    RETURN QUERY
    SELECT
      'delete_orphan'::text AS action,
      e.id AS employee_id,
      e.real_name AS employee_name,
      '原租户已删除，无法恢复，将删除该员工及其订单/会员'::text AS detail
    FROM public.employees e
    WHERE e.id = ANY(v_orphan_ids);
  END IF;

  -- ========== 3. 执行：p_dry_run = false 时 ==========
  IF NOT p_dry_run THEN
    -- 3.1 移回员工
    UPDATE public.employees e
    SET tenant_id = sub.tenant_id
    FROM (
      SELECT DISTINCT ON (e2.id) e2.id AS emp_id, t.id AS tenant_id
      FROM public.employees e2
      JOIN public.tenants t ON t.tenant_code NOT IN ('002', 'platform') AND t.admin_employee_id IS NOT NULL
      WHERE e2.tenant_id = v_002_id
        AND e2.id != v_002_admin_id
        AND (
          (EXISTS (SELECT 1 FROM public.orders o WHERE (o.creator_id = e2.id OR o.sales_user_id = e2.id) AND o.created_at >= t.created_at)
           AND NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE (o2.creator_id = e2.id OR o2.sales_user_id = e2.id) AND o2.created_at < t.created_at))
          OR
          (EXISTS (SELECT 1 FROM public.members m WHERE (m.creator_id = e2.id OR m.recorder_id = e2.id) AND m.created_at >= t.created_at)
           AND NOT EXISTS (SELECT 1 FROM public.members m2 WHERE (m2.creator_id = e2.id OR m2.recorder_id = e2.id) AND m2.created_at < t.created_at))
        )
      ORDER BY e2.id, t.created_at
    ) sub
    WHERE e.id = sub.emp_id AND e.tenant_id = v_002_id;

    -- 3.2 删除孤儿（p_delete_orphans = true 时）
    IF p_delete_orphans AND v_orphan_ids IS NOT NULL AND array_length(v_orphan_ids, 1) > 0 THEN
      -- 按 delete_tenant 的依赖顺序删除
      DELETE FROM public.operation_logs WHERE operator_id = ANY(v_orphan_ids);
      UPDATE public.operation_logs SET restored_by = null WHERE restored_by = ANY(v_orphan_ids);
      DELETE FROM public.activity_gifts WHERE creator_id = ANY(v_orphan_ids);
      UPDATE public.audit_records SET reviewer_id = null WHERE reviewer_id = ANY(v_orphan_ids);
      UPDATE public.audit_records SET submitter_id = null WHERE submitter_id = ANY(v_orphan_ids);
      UPDATE public.employee_name_history SET changed_by = null WHERE changed_by = ANY(v_orphan_ids);

      DELETE FROM public.orders
      WHERE creator_id = ANY(v_orphan_ids) OR sales_user_id = ANY(v_orphan_ids);

      SELECT array_agg(id) INTO v_member_ids FROM public.members
      WHERE creator_id = ANY(v_orphan_ids) OR recorder_id = ANY(v_orphan_ids);

      IF v_member_ids IS NOT NULL AND array_length(v_member_ids, 1) > 0 THEN
        DELETE FROM public.member_activity WHERE member_id = ANY(v_member_ids);
        DELETE FROM public.activity_gifts WHERE member_id = ANY(v_member_ids);
        DELETE FROM public.points_ledger WHERE member_id = ANY(v_member_ids);
        UPDATE public.orders SET member_id = null WHERE member_id = ANY(v_member_ids);
      END IF;

      DELETE FROM public.members
      WHERE creator_id = ANY(v_orphan_ids) OR recorder_id = ANY(v_orphan_ids);

      DELETE FROM public.points_ledger WHERE creator_id = ANY(v_orphan_ids);

      BEGIN
        UPDATE public.balance_change_logs SET operator_id = null WHERE operator_id = ANY(v_orphan_ids);
      EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
      END;
      BEGIN
        UPDATE public.ledger_transactions SET operator_id = null WHERE operator_id = ANY(v_orphan_ids);
      EXCEPTION WHEN undefined_table THEN null; WHEN others THEN null;
      END;

      DELETE FROM public.employees WHERE id = ANY(v_orphan_ids);
    END IF;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.repair_tenant_002_wrong_assignments(boolean, boolean) IS
'修复 002 租户数据：1) 能归属到现有租户的移回 2) 原租户已删除的删除。p_dry_run=true 仅预览，false 执行。p_delete_orphans=true 时删除孤儿数据。';
