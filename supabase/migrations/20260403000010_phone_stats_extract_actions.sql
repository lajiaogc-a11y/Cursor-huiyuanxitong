-- 扩展 rpc_phone_stats：增加 user_today_extract_actions（今日已用提取次数）
-- 用于前端区分展示：今日净提取号码 vs 今日已用提取次数
-- 需先 DROP 再 CREATE，因返回类型变更

DROP FUNCTION IF EXISTS rpc_phone_stats(uuid);

CREATE FUNCTION rpc_phone_stats(p_tenant_id UUID)
RETURNS TABLE(
  total_available INT,
  total_reserved INT,
  user_today_extracted INT,
  user_today_extract_actions INT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
SELECT
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'available'),
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'reserved'),
  GREATEST(0,
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = auth.uid() AND action = 'extract' AND action_at::date = now()::date)
    -
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = auth.uid() AND action = 'return' AND action_at::date = now()::date)
  ),
  (
    SELECT COALESCE(COUNT(*), 0)::INT
    FROM (
      SELECT DISTINCT pr.action_at
      FROM phone_reservations pr
      WHERE pr.user_id = auth.uid()
        AND pr.action = 'extract'
        AND pr.action_at::date = now()::date
    ) x
  );
$$;
