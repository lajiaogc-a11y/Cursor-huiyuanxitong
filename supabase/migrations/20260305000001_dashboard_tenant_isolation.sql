-- 仪表盘租户数据隔离：get_dashboard_trend_data 仅返回当前登录用户所属租户的订单数据
-- 修复：003 租户不应看到 002 租户的订单/交易数据
CREATE OR REPLACE FUNCTION public.get_dashboard_trend_data(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_sales_person text DEFAULT NULL::text)
 RETURNS TABLE(day_date date, order_count bigint, profit numeric, trading_users bigint, ngn_volume numeric, ghs_volume numeric, usdt_volume numeric, ngn_profit numeric, ghs_profit numeric, usdt_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- 获取当前登录用户所属租户（profiles -> employees -> tenant_id）
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  RETURN QUERY
  WITH normal_orders AS (
    SELECT
      DATE(o.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(o.profit_ngn), 0) AS total_profit,
      COUNT(DISTINCT o.phone_number) AS unique_phones,
      COALESCE(SUM(CASE WHEN o.currency IN ('NGN', '奈拉') THEN o.amount ELSE 0 END), 0) AS v_ngn,
      COALESCE(SUM(CASE WHEN o.currency IN ('GHS', '赛地') THEN o.amount ELSE 0 END), 0) AS v_ghs,
      COALESCE(SUM(CASE WHEN o.currency IN ('NGN', '奈拉') THEN o.profit_ngn ELSE 0 END), 0) AS p_ngn,
      COALESCE(SUM(CASE WHEN o.currency IN ('GHS', '赛地') THEN o.profit_ngn ELSE 0 END), 0) AS p_ghs
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    WHERE o.status = 'completed'
      AND o.is_deleted = false
      AND o.currency != 'USDT'
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR e.real_name = p_sales_person)
      AND (v_tenant_id IS NULL OR e.tenant_id = v_tenant_id OR (o.sales_user_id IS NULL AND EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = v_tenant_id)))
    GROUP BY DATE(o.created_at)
  ),
  usdt_orders AS (
    SELECT
      DATE(o.created_at) AS d,
      COUNT(*) AS cnt,
      COALESCE(SUM(o.profit_usdt), 0) AS total_profit_usdt,
      COUNT(DISTINCT o.phone_number) AS unique_phones,
      COALESCE(SUM(o.amount), 0) AS v_usdt,
      COALESCE(SUM(o.profit_usdt), 0) AS p_usdt
    FROM orders o
    LEFT JOIN employees e ON o.sales_user_id = e.id
    WHERE o.status = 'completed'
      AND o.is_deleted = false
      AND o.currency = 'USDT'
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
      AND (p_sales_person IS NULL OR e.real_name = p_sales_person)
      AND (v_tenant_id IS NULL OR e.tenant_id = v_tenant_id OR (o.sales_user_id IS NULL AND EXISTS (SELECT 1 FROM employees e2 WHERE e2.id = o.creator_id AND e2.tenant_id = v_tenant_id)))
    GROUP BY DATE(o.created_at)
  ),
  date_series AS (
    SELECT generate_series(p_start_date::date, p_end_date::date, '1 day'::interval)::date AS d
  )
  SELECT
    ds.d AS day_date,
    (COALESCE(n.cnt, 0) + COALESCE(u.cnt, 0))::bigint AS order_count,
    (COALESCE(n.total_profit, 0) + COALESCE(u.total_profit_usdt, 0))::numeric AS profit,
    (COALESCE(n.unique_phones, 0) + COALESCE(u.unique_phones, 0))::bigint AS trading_users,
    COALESCE(n.v_ngn, 0)::numeric AS ngn_volume,
    COALESCE(n.v_ghs, 0)::numeric AS ghs_volume,
    COALESCE(u.v_usdt, 0)::numeric AS usdt_volume,
    COALESCE(n.p_ngn, 0)::numeric AS ngn_profit,
    COALESCE(n.p_ghs, 0)::numeric AS ghs_profit,
    COALESCE(u.p_usdt, 0)::numeric AS usdt_profit
  FROM date_series ds
  LEFT JOIN normal_orders n ON n.d = ds.d
  LEFT JOIN usdt_orders u ON u.d = ds.d
  ORDER BY ds.d;
END;
$function$;
