-- 强制恢复租户 002 的全部数据
-- 用户要求：租户 002 的所有数据全部恢复
-- 1. 强制将所有可能属于 002 的员工归属到 002
-- 2. 002 查看时：返回所有订单/会员（creator/sales/recorder 不属于 003/004/005 的 + 孤儿数据）
--    若系统中仅有 002 一个业务租户，则等效于返回全部

DO $$
DECLARE
  v_002_id uuid;
  v_platform_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('002', '租户002', 'active')
    RETURNING id INTO v_002_id;
    RAISE NOTICE '已创建租户 002';
  END IF;

  SELECT id INTO v_platform_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;

  -- 1. 002 管理员必须属于 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  FROM public.tenants t
  WHERE t.id = v_002_id AND t.admin_employee_id = e.id AND (e.tenant_id IS NULL OR e.tenant_id != v_002_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '002 管理员归属: % 人', v_count;

  -- 2. 所有 tenant_id 为 null 的员工（排除 platform 超管）归属 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  WHERE e.tenant_id IS NULL
    AND (e.is_super_admin = false OR e.is_super_admin IS NULL);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'null 员工归属 002: % 人', v_count;

  -- 3. 有订单/会员关联的员工（creator/sales/recorder）全部归属 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  WHERE (e.tenant_id IS NULL OR (v_platform_id IS NOT NULL AND e.tenant_id = v_platform_id))
    AND (e.is_super_admin = false OR e.is_super_admin IS NULL)
    AND (
      EXISTS (SELECT 1 FROM public.orders o WHERE o.creator_id = e.id OR o.sales_user_id = e.id)
      OR EXISTS (SELECT 1 FROM public.members m WHERE m.creator_id = e.id OR m.recorder_id = e.id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '有业务关联的员工归属 002: % 人', v_count;

END $$;

-- 修改 RPC：002 查看时返回所有「非其他租户」的订单/会员
-- 即：creator/sales 属于 002 或 null/已删除，且 creator/sales 不属于 003/004/005
-- 若仅有 002，则返回全部

CREATE OR REPLACE FUNCTION public.platform_get_tenant_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_other_tenant_ids uuid[];
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  IF public.is_platform_super_admin(auth.uid()) THEN
    NULL;
  ELSE
    SELECT e.tenant_id INTO v_my_tenant_id
    FROM profiles p JOIN employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (
      SELECT 1 FROM tenants t
      JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid()
      WHERE t.tenant_code = '002'
    ) INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id
       AND NOT (v_is_002_admin AND p_tenant_id = (SELECT id FROM tenants WHERE tenant_code = '002' LIMIT 1)) THEN
      RETURN;
    END IF;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  SELECT ARRAY_AGG(id) INTO v_other_tenant_ids
  FROM public.tenants WHERE tenant_code NOT IN ('002', 'platform');

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND o.currency IS DISTINCT FROM 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
      OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
        (o.creator_id IS NULL AND o.sales_user_id IS NULL)
        OR (o.creator_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.creator_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) <> ALL(COALESCE(v_other_tenant_ids, ARRAY[]::uuid[])))))
        OR (o.sales_user_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.sales_user_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) <> ALL(COALESCE(v_other_tenant_ids, ARRAY[]::uuid[])))))
      ))
    )
  ORDER BY o.created_at DESC;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_get_tenant_usdt_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_other_tenant_ids uuid[];
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  IF public.is_platform_super_admin(auth.uid()) THEN NULL;
  ELSE
    SELECT e.tenant_id INTO v_my_tenant_id
    FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM tenants t JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid() WHERE t.tenant_code = '002') INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id AND NOT (v_is_002_admin AND p_tenant_id = (SELECT id FROM tenants WHERE tenant_code = '002' LIMIT 1)) THEN RETURN; END IF;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  SELECT ARRAY_AGG(id) INTO v_other_tenant_ids FROM public.tenants WHERE tenant_code NOT IN ('002', 'platform');

  RETURN QUERY
  SELECT o.* FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency = 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
      OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
        (o.creator_id IS NULL AND o.sales_user_id IS NULL)
        OR (o.creator_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.creator_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR NOT (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) = ANY(v_other_tenant_ids))))
        OR (o.sales_user_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.sales_user_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR NOT (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) = ANY(v_other_tenant_ids))))
      ))
    )
  ORDER BY o.created_at DESC;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_get_tenant_members_full(p_tenant_id uuid)
RETURNS SETOF public.members
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_other_tenant_ids uuid[];
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  IF public.is_platform_super_admin(auth.uid()) THEN NULL;
  ELSE
    SELECT e.tenant_id INTO v_my_tenant_id
    FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM tenants t JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid() WHERE t.tenant_code = '002') INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id AND NOT (v_is_002_admin AND p_tenant_id = (SELECT id FROM tenants WHERE tenant_code = '002' LIMIT 1)) THEN RETURN; END IF;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  SELECT ARRAY_AGG(id) INTO v_other_tenant_ids FROM public.tenants WHERE tenant_code NOT IN ('002', 'platform');

  RETURN QUERY
  SELECT m.* FROM public.members m
  WHERE (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
    OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
      (m.creator_id IS NULL AND m.recorder_id IS NULL)
      OR (m.creator_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.creator_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR NOT (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.creator_id LIMIT 1) = ANY(v_other_tenant_ids))))
      OR (m.recorder_id IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id) OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.recorder_id LIMIT 1) IS NULL OR (v_other_tenant_ids IS NULL OR NOT (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.recorder_id LIMIT 1) = ANY(v_other_tenant_ids))))
    ))
  )
  ORDER BY m.created_at DESC;
END;
$fn$;

-- platform_get_tenant_overview 和 platform_get_dashboard_trend_data 使用相同 002 逻辑（由 20260326000000 已支持租户员工调用，此处仅确保 002 孤儿逻辑一致）
