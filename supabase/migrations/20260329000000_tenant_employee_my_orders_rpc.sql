-- 租户员工专用 RPC：根据当前用户 employee.tenant_id 返回本租户数据，无需传参
-- 解决 platform_get_tenant_* 的 auth 检查可能失败的问题

CREATE OR REPLACE FUNCTION public.get_my_tenant_orders_full()
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
BEGIN
  -- 优先：profiles.employee_id → employees.tenant_id
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  -- 兜底：profile 无 employee_id 时，用 profile.email 前缀匹配 employees.username
  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  IF v_tenant_id = v_002_id THEN
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency IS DISTINCT FROM 'USDT'
    ORDER BY o.created_at DESC;
  ELSE
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency IS DISTINCT FROM 'USDT'
      AND (EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = v_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_tenant_id))
    ORDER BY o.created_at DESC;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_usdt_orders_full()
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  IF v_tenant_id = v_002_id THEN
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency = 'USDT'
    ORDER BY o.created_at DESC;
  ELSE
    RETURN QUERY SELECT o.* FROM public.orders o
    WHERE (o.is_deleted = false OR o.is_deleted IS NULL) AND o.currency = 'USDT'
      AND (EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = v_tenant_id)
           OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_tenant_id))
    ORDER BY o.created_at DESC;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_members_full()
RETURNS SETOF public.members
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  IF v_tenant_id = v_002_id THEN
    RETURN QUERY SELECT m.* FROM public.members m ORDER BY m.created_at DESC;
  ELSE
    RETURN QUERY SELECT m.* FROM public.members m
    WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id = m.creator_id AND e.tenant_id = v_tenant_id)
       OR EXISTS (SELECT 1 FROM employees e WHERE e.id = m.recorder_id AND e.tenant_id = v_tenant_id)
    ORDER BY m.created_at DESC;
  END IF;
END;
$fn$;

-- 租户员工专用：仪表盘趋势数据
CREATE OR REPLACE FUNCTION public.get_my_tenant_dashboard_trend(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_sales_person text DEFAULT NULL
)
RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;
  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT * FROM public.platform_get_dashboard_trend_data(v_tenant_id, p_start_date, p_end_date, p_sales_person);
END;
$fn$;
