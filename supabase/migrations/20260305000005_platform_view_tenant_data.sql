-- 平台超级管理员只读查看任意租户数据（租户不可知，不产生审计日志）

-- 1. 查看租户订单（只读，按创建时间倒序）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_orders(
  p_tenant_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  order_number text,
  order_type text,
  amount numeric,
  currency text,
  status text,
  phone_number text,
  created_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id, o.order_number, o.order_type, o.amount, o.currency, o.status, o.phone_number, o.created_at, o.completed_at
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
    )
  ORDER BY o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- 2. 查看租户会员（只读）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_members(
  p_tenant_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  member_code text,
  phone_number text,
  member_level text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.member_code, m.phone_number, m.member_level, m.created_at
  FROM public.members m
  WHERE (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
  )
  ORDER BY m.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- 3. 租户数据概览（计数）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_overview(p_tenant_id uuid)
RETURNS TABLE(
  order_count bigint,
  member_count bigint,
  employee_count bigint
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
    (SELECT count(*)::bigint FROM public.orders o
     WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
       AND (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
            OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id))),
    (SELECT count(*)::bigint FROM public.members m
     WHERE EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
        OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)),
    (SELECT count(*)::bigint FROM public.employees e WHERE e.tenant_id = p_tenant_id);
END;
$fn$;
