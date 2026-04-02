-- 修复租户 002 数据不可见
-- 1. 扩展 platform_get_tenant_*：查看 002 时包含 creator/sales/recorder 为 null 或 tenant_id 为 null 的员工的数据
-- 2. 强制将 002 管理员及有订单/会员的员工的 tenant_id 设为 002

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

  -- 002 管理员必须属于 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  FROM public.tenants t
  WHERE t.id = v_002_id AND t.admin_employee_id = e.id AND (e.tenant_id IS NULL OR e.tenant_id != v_002_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '002 管理员归属: % 人', v_count;

  -- 有订单/会员但 tenant_id 为 null 的员工归属 002
  UPDATE public.employees e
  SET tenant_id = v_002_id
  WHERE e.tenant_id IS NULL
    AND (e.is_super_admin = false OR e.is_super_admin IS NULL)
    AND (
      EXISTS (SELECT 1 FROM public.orders o WHERE o.creator_id = e.id OR o.sales_user_id = e.id)
      OR EXISTS (SELECT 1 FROM public.members m WHERE m.creator_id = e.id OR m.recorder_id = e.id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '有业务数据的 null 员工归属 002: % 人', v_count;
END $$;

-- 扩展 platform_get_tenant_orders_full：002 时包含 creator/sales 已删除、tenant_id 为 null、或 creator/sales 皆空
CREATE OR REPLACE FUNCTION public.platform_get_tenant_orders_full(p_tenant_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND o.currency IS DISTINCT FROM 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
      OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
        (o.creator_id IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.creator_id)
          OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
        ))
        OR (o.sales_user_id IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.sales_user_id)
          OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
        ))
        OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
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
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND o.currency = 'USDT'
    AND (
      EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
      OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
        (o.creator_id IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.creator_id)
          OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
        ))
        OR (o.sales_user_id IS NOT NULL AND (
          NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.sales_user_id)
          OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
        ))
        OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
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
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  SELECT m.*
  FROM public.members m
  WHERE (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
    OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
      (m.creator_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id)
        OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.creator_id LIMIT 1) IS NULL
      ))
      OR (m.recorder_id IS NOT NULL AND (
        NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id)
        OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.recorder_id LIMIT 1) IS NULL
      ))
      OR (m.creator_id IS NULL AND m.recorder_id IS NULL)
    ))
  )
  ORDER BY m.created_at DESC;
END;
$fn$;

-- 更新 platform_get_tenant_overview 以匹配
CREATE OR REPLACE FUNCTION public.platform_get_tenant_overview(p_tenant_id uuid)
RETURNS TABLE(
  order_count bigint,
  member_count bigint,
  employee_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  SELECT
    (SELECT count(*)::bigint FROM public.orders o
     WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
       AND (
         EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = p_tenant_id)
         OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = p_tenant_id)
         OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
           (o.creator_id IS NOT NULL AND (
             NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.creator_id)
             OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
           ))
           OR (o.sales_user_id IS NOT NULL AND (
             NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = o.sales_user_id)
             OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
           ))
           OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
         ))
       )),
    (SELECT count(*)::bigint FROM public.members m
     WHERE (
       EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.creator_id AND e.tenant_id = p_tenant_id)
       OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = m.recorder_id AND e.tenant_id = p_tenant_id)
       OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
         (m.creator_id IS NOT NULL AND (
           NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id)
           OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.creator_id LIMIT 1) IS NULL
         ))
         OR (m.recorder_id IS NOT NULL AND (
           NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id)
           OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = m.recorder_id LIMIT 1) IS NULL
         ))
         OR (m.creator_id IS NULL AND m.recorder_id IS NULL)
       ))
     )),
    (SELECT count(*)::bigint FROM public.employees e WHERE e.tenant_id = p_tenant_id);
END;
$fn$;

-- 更新 platform_get_dashboard_trend_data 以匹配
CREATE OR REPLACE FUNCTION public.platform_get_dashboard_trend_data(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_sales_person text DEFAULT NULL
)
RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_002_id uuid;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  RETURN QUERY
  WITH base_filter AS (
    SELECT o.id, o.created_at,
           COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) AS phone_number,
           o.currency, o.amount, o.profit_ngn, o.profit_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    LEFT JOIN employees e_creator ON o.sales_user_id IS NULL AND o.creator_id = e_creator.id
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.status = 'completed'
      AND (o.is_deleted = false OR o.is_deleted IS NULL)
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR COALESCE(e.real_name, e_creator.real_name) = p_sales_person)
      AND (
        EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = p_tenant_id)
        OR EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id AND e2.tenant_id = p_tenant_id)
        OR (v_002_id IS NOT NULL AND p_tenant_id = v_002_id AND (
          (o.creator_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.creator_id LIMIT 1) IS NULL
          ))
          OR (o.sales_user_id IS NOT NULL AND (
            NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.sales_user_id)
            OR (SELECT e2.tenant_id FROM employees e2 WHERE e2.id = o.sales_user_id LIMIT 1) IS NULL
          ))
          OR (o.creator_id IS NULL AND o.sales_user_id IS NULL)
        ))
      )
  ),
  normal_orders AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(bf.profit_ngn), 0) AS total_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0) AS v_ngn,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0) AS v_ghs,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ngn,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0) AS p_ghs
    FROM base_filter bf
    WHERE bf.currency != 'USDT'
    GROUP BY DATE(bf.created_at)
  ),
  usdt_orders AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(bf.profit_usdt), 0) AS total_profit_usdt,
      COALESCE(SUM(bf.amount), 0) AS v_usdt,
      COALESCE(SUM(bf.profit_usdt), 0) AS p_usdt
    FROM base_filter bf
    WHERE bf.currency = 'USDT'
    GROUP BY DATE(bf.created_at)
  ),
  daily_unique_users AS (
    SELECT DATE(bf.created_at) AS d,
      COUNT(DISTINCT CASE WHEN bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) != '' THEN bf.phone_number END)::bigint AS unique_phones
    FROM base_filter bf
    GROUP BY DATE(bf.created_at)
  ),
  period_unique_users AS (
    SELECT COUNT(DISTINCT bf.phone_number)::bigint AS total
    FROM base_filter bf
    WHERE bf.phone_number IS NOT NULL AND TRIM(bf.phone_number) != ''
  ),
  period_totals AS (
    SELECT
      COUNT(*)::bigint AS total_orders,
      (COALESCE(SUM(CASE WHEN bf.currency != 'USDT' THEN bf.profit_ngn ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0))::numeric AS total_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ngn_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.amount ELSE 0 END), 0)::numeric AS total_ghs_vol,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.amount ELSE 0 END), 0)::numeric AS total_usdt_vol,
      COALESCE(SUM(CASE WHEN bf.currency IN ('NGN', '奈拉') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ngn_profit,
      COALESCE(SUM(CASE WHEN bf.currency IN ('GHS', '赛地') THEN bf.profit_ngn ELSE 0 END), 0)::numeric AS total_ghs_profit,
      COALESCE(SUM(CASE WHEN bf.currency = 'USDT' THEN bf.profit_usdt ELSE 0 END), 0)::numeric AS total_usdt_profit
    FROM base_filter bf
  ),
  date_series AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT ds.d AS day_date,
    (COALESCE(n.cnt, 0) + COALESCE(u.cnt, 0))::bigint AS order_count,
    (COALESCE(n.total_profit, 0) + COALESCE(u.total_profit_usdt, 0))::numeric AS profit,
    COALESCE(du.unique_phones, 0)::bigint AS trading_users,
    COALESCE(n.v_ngn, 0)::numeric AS ngn_volume,
    COALESCE(n.v_ghs, 0)::numeric AS ghs_volume,
    COALESCE(u.v_usdt, 0)::numeric AS usdt_volume,
    COALESCE(n.p_ngn, 0)::numeric AS ngn_profit,
    COALESCE(n.p_ghs, 0)::numeric AS ghs_profit,
    COALESCE(u.p_usdt, 0)::numeric AS usdt_profit
  FROM date_series ds
  LEFT JOIN normal_orders n ON n.d = ds.d
  LEFT JOIN usdt_orders u ON u.d = ds.d
  LEFT JOIN daily_unique_users du ON du.d = ds.d
  ORDER BY ds.d;

  RETURN QUERY
  SELECT NULL::date,
    COALESCE((SELECT total_orders FROM period_totals), 0)::bigint,
    COALESCE((SELECT total_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total FROM period_unique_users), 0)::bigint,
    COALESCE((SELECT total_ngn_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_vol FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ngn_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_ghs_profit FROM period_totals), 0)::numeric,
    COALESCE((SELECT total_usdt_profit FROM period_totals), 0)::numeric;
END;
$fn$;
