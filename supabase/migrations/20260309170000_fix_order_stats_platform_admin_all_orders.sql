-- 修复：移除租户过滤，使订单统计与列表一致
-- 问题：orders 表 RLS 允许 admin/manager/staff 查看全部订单，但 get_order_filter_stats 按租户过滤导致 758 单显示但卡值/利润为 0
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
BEGIN
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
  )
  SELECT
    COALESCE(SUM(CASE WHEN bo.currency = 'USDT' THEN COALESCE(bo.profit_usdt, 0) ELSE COALESCE(bo.profit_ngn, 0) END), 0)::numeric AS total_profit,
    COALESCE(SUM(
      COALESCE(NULLIF(bo.amount, 0), COALESCE(bo.card_value, 0) * COALESCE(bo.exchange_rate, 0), 0)
    ), 0)::numeric AS total_card_value
  FROM base_orders bo;
END;
$fn$;
