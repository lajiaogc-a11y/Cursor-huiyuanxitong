-- 激进修复：租户 002 员工必须能看到数据
-- 1. 所有非平台超管员工强制归属 002
-- 2. RLS：002 员工可查看全部订单/会员（不再按 creator/sales 过滤）
-- 3. RPC：002 查看时返回全部订单/会员

DO $$
DECLARE
  v_002_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('002', '租户002', 'active')
    RETURNING id INTO v_002_id;
  END IF;

  -- 所有非平台超管员工强制归属 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  WHERE (e.is_super_admin = false OR e.is_super_admin IS NULL)
    AND (e.tenant_id IS NULL OR e.tenant_id != v_002_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '强制归属 002: % 人', v_count;
END $$;

-- RLS：002 员工可查看全部订单（不再按 creator/sales 过滤）
DROP POLICY IF EXISTS orders_employee_select ON public.orders;
CREATE POLICY orders_employee_select ON public.orders FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
            OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS orders_employee_update ON public.orders;
CREATE POLICY orders_employee_update ON public.orders FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
            OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
          )
        )
      )
    )
  )
)
WITH CHECK ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role)));

DROP POLICY IF EXISTS orders_admin_manager_delete ON public.orders;
CREATE POLICY orders_admin_manager_delete ON public.orders FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
            OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
          )
        )
      )
    )
  )
);

-- RLS：002 员工可查看全部会员
DROP POLICY IF EXISTS members_employee_select ON public.members;
CREATE POLICY members_employee_select ON public.members FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
            OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS members_employee_update ON public.members;
CREATE POLICY members_employee_update ON public.members FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
            OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
  )
)
WITH CHECK ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role)));

DROP POLICY IF EXISTS members_employee_delete ON public.members;
CREATE POLICY members_employee_delete ON public.members FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid()
      AND (
        e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
        OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_code = '002' AND t.admin_employee_id = e.id)
        OR (
          e.tenant_id IS NOT NULL
          AND (
            (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
            OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
  )
);

-- RPC：002 查看时返回全部订单/会员（无过滤）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN RETURN; END IF;

  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    SELECT e.tenant_id INTO v_my_tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM tenants t JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid() WHERE t.tenant_code = '002') INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id AND NOT (v_is_002_admin AND p_tenant_id = v_002_id) THEN RETURN; END IF;
  END IF;

  IF p_tenant_id = v_002_id THEN
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency IS DISTINCT FROM 'USDT'
    ORDER BY o.created_at DESC;
  ELSE
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency IS DISTINCT FROM 'USDT'
      AND (EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id))
    ORDER BY o.created_at DESC;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_get_tenant_usdt_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN RETURN; END IF;

  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    SELECT e.tenant_id INTO v_my_tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM tenants t JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid() WHERE t.tenant_code = '002') INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id AND NOT (v_is_002_admin AND p_tenant_id = v_002_id) THEN RETURN; END IF;
  END IF;

  IF p_tenant_id = v_002_id THEN
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency = 'USDT'
    ORDER BY o.created_at DESC;
  ELSE
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency = 'USDT'
      AND (EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id))
    ORDER BY o.created_at DESC;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_get_tenant_members_full(p_tenant_id uuid)
RETURNS SETOF public.members
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
  v_my_tenant_id uuid;
  v_is_002_admin boolean;
BEGIN
  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_002_id IS NULL THEN RETURN; END IF;

  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    SELECT e.tenant_id INTO v_my_tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM tenants t JOIN profiles p ON p.employee_id = t.admin_employee_id AND p.id = auth.uid() WHERE t.tenant_code = '002') INTO v_is_002_admin;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id AND NOT (v_is_002_admin AND p_tenant_id = v_002_id) THEN RETURN; END IF;
  END IF;

  IF p_tenant_id = v_002_id THEN
    RETURN QUERY SELECT m.* FROM public.members m ORDER BY m.created_at DESC;
  ELSE
    RETURN QUERY SELECT m.* FROM public.members m
    WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
       OR EXISTS (SELECT 1 FROM employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
    ORDER BY m.created_at DESC;
  END IF;
END;
$fn$;
