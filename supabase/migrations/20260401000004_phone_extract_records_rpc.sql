-- 号码提取器：提取/归还记录 RPC（按批次分组，供提取设置页面展示）
-- 返回：操作类型、操作人、数量、时间

CREATE OR REPLACE FUNCTION rpc_phone_extract_records(p_tenant_id UUID, p_limit INT DEFAULT 100)
RETURNS TABLE(
  action_type TEXT,
  operator_name TEXT,
  action_count INT,
  action_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    pr.action::TEXT AS action_type,
    MAX(COALESCE(e.real_name, p.email, pr.user_id::TEXT)) AS operator_name,
    COUNT(*)::INT AS action_count,
    date_trunc('minute', MIN(pr.action_at)) AS action_at
  FROM phone_reservations pr
  JOIN phone_pool pp ON pp.id = pr.phone_pool_id
  LEFT JOIN profiles p ON p.id = pr.user_id
  LEFT JOIN employees e ON e.id = p.employee_id
  WHERE pp.tenant_id = p_tenant_id
    AND pr.action IN ('extract', 'return')
  GROUP BY pr.user_id, pr.action, date_trunc('minute', pr.action_at)
  ORDER BY action_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;
