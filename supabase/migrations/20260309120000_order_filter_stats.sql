-- 订单筛选统计 RPC：返回符合筛选条件的利润总和、卡值总和（用于订单管理全量汇总，非当前页）
-- 解决：选择「全部」时卡值总和只统计当前页的 bug

CREATE OR REPLACE FUNCTION public.get_order_filter_stats(
  p_status text DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_vendor uuid DEFAULT NULL,
  p_payment_provider uuid DEFAULT NULL,
  p_card_type uuid DEFAULT NULL,
  p_creator_id uuid DEFAULT NULL,
  p_min_profit numeric DEFAULT NULL,
  p_max_profit numeric DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_search_term text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(total_profit numeric, total_card_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- 确定租户：平台查看指定租户时用 p_tenant_id，否则用当前用户租户
  IF p_tenant_id IS NOT NULL AND public.is_platform_super_admin(auth.uid()) THEN
    v_tenant_id := p_tenant_id;
  ELSE
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH base_orders AS (
    SELECT o.id, o.currency, o.amount, o.profit_ngn, o.profit_usdt, o.card_value, o.exchange_rate
    FROM orders o
    WHERE o.is_deleted = false
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_currency IS NULL OR p_currency = 'all' OR o.currency = p_currency)
      AND (p_vendor IS NULL OR o.card_merchant_id = p_vendor)
      AND (p_payment_provider IS NULL OR o.vendor_id = p_payment_provider)
      AND (p_card_type IS NULL OR o.order_type = p_card_type)
      AND (p_creator_id IS NULL OR o.creator_id = p_creator_id)
      AND (p_min_profit IS NULL OR (o.currency = 'USDT' AND COALESCE(o.profit_usdt, 0) >= p_min_profit) OR ((o.currency IS NULL OR o.currency != 'USDT') AND COALESCE(o.profit_ngn, 0) >= p_min_profit))
      AND (p_max_profit IS NULL OR (o.currency = 'USDT' AND COALESCE(o.profit_usdt, 0) <= p_max_profit) OR ((o.currency IS NULL OR o.currency != 'USDT') AND COALESCE(o.profit_ngn, 0) <= p_max_profit))
      AND (p_start_date IS NULL OR o.created_at >= p_start_date)
      AND (p_end_date IS NULL OR o.created_at <= p_end_date)
      AND (p_search_term IS NULL OR p_search_term = '' OR o.order_number ILIKE '%' || p_search_term || '%' OR o.phone_number ILIKE '%' || p_search_term || '%' OR o.member_code_snapshot ILIKE '%' || p_search_term || '%' OR o.remark ILIKE '%' || p_search_term || '%')
      AND (v_tenant_id IS NULL OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = v_tenant_id) OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_tenant_id))
  )
  SELECT
    COALESCE(SUM(CASE WHEN bo.currency = 'USDT' THEN bo.profit_usdt ELSE bo.profit_ngn END), 0)::numeric AS total_profit,
    COALESCE(SUM(bo.amount), 0)::numeric AS total_card_value
  FROM base_orders bo;
END;
$fn$;
