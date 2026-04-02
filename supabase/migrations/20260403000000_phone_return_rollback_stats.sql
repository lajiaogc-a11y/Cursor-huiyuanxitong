-- 归还号码后，今日提取数量应回滚（净数 = 提取 - 归还）
-- 否则员工归还后「今日」和「已提取」统计不会减少

-- 1. 修改 rpc_phone_stats：user_today_extracted 改为净数（今日提取数 - 今日归还数）
CREATE OR REPLACE FUNCTION rpc_phone_stats(p_tenant_id UUID)
RETURNS TABLE(total_available INT, total_reserved INT, user_today_extracted INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
SELECT
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'available'),
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'reserved'),
  GREATEST(0,
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = auth.uid() AND action = 'extract' AND action_at::date = now()::date)
    -
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = auth.uid() AND action = 'return' AND action_at::date = now()::date)
  );
$$;

-- 2. 修改 rpc_extract_phones：每日限制检查使用净数（归还后配额可释放）
CREATE OR REPLACE FUNCTION rpc_extract_phones(p_tenant_id UUID, p_limit_count INT)
RETURNS TABLE(id BIGINT, normalized TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_limit INT;
  v_user UUID := auth.uid();
  v_extract_actions_today INT;
  v_daily_limit INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_limit_count <= 0 THEN RETURN; END IF;

  v_daily_limit := (
    SELECT s.per_user_daily_limit
    FROM phone_extract_settings s
    WHERE s.id = 1
  );
  -- 每日上限按“提取次数”计算（与前端文案一致），而不是按号码条数。
  -- 同一次调用内 action_at 相同，因此可用 distinct(action_at) 统计调用次数。
  v_extract_actions_today := (
    SELECT COALESCE(COUNT(*), 0)::INT
    FROM (
      SELECT DISTINCT pr.action_at
      FROM phone_reservations pr
      WHERE pr.user_id = v_user
        AND pr.action = 'extract'
        AND pr.action_at::date = now()::date
    ) x
  );

  IF v_extract_actions_today >= v_daily_limit THEN
    RAISE EXCEPTION 'daily_limit_exceeded';
  END IF;

  v_limit := LEAST(
    p_limit_count,
    (
      SELECT s.per_extract_limit
      FROM phone_extract_settings s
      WHERE s.id = 1
    )
  );

  FOR rec IN
    SELECT pp.id, pp.normalized FROM phone_pool pp
    WHERE pp.tenant_id = p_tenant_id AND pp.status = 'available'
    ORDER BY pp.id
    FOR UPDATE OF pp SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE phone_pool p
    SET status = 'reserved', reserved_by = v_user, reserved_at = now()
    WHERE p.id = rec.id;
    INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (rec.id, v_user, 'extract');
    RETURN QUERY SELECT rec.id, rec.normalized;
  END LOOP;
END;
$$;
