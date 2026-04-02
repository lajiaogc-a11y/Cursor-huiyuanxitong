-- 号码池 return/consume/stats 的 employee_id 版本，供后端 API 使用
-- 前端 JWT 登录时 auth.uid() 为 null，需通过后端 API 调用这些函数

CREATE OR REPLACE FUNCTION public.rpc_return_phones_by_employee(
  phone_ids BIGINT[],
  p_employee_id UUID
)
RETURNS TABLE(returned_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;
  IF phone_ids IS NULL OR array_length(phone_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
    SET status = 'available', reserved_by = NULL, reserved_at = NULL
    WHERE id = pid AND reserved_by = p_employee_id AND status = 'reserved';
    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (pid, p_employee_id, 'return');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_consume_phones_by_employee(
  phone_ids BIGINT[],
  p_employee_id UUID
)
RETURNS TABLE(consumed_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;
  IF phone_ids IS NULL OR array_length(phone_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
    SET status = 'consumed', reserved_by = NULL, reserved_at = NULL
    WHERE id = pid AND reserved_by = p_employee_id AND status = 'reserved';
    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (pid, p_employee_id, 'consume');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_phone_stats_by_employee(
  p_tenant_id UUID,
  p_employee_id UUID
)
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
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = p_employee_id AND action = 'extract' AND action_at::date = now()::date)
    -
    (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = p_employee_id AND action = 'return' AND action_at::date = now()::date)
  ),
  (
    SELECT COALESCE(COUNT(*), 0)::INT
    FROM (
      SELECT DISTINCT pr.action_at
      FROM phone_reservations pr
      WHERE pr.user_id = p_employee_id
        AND pr.action = 'extract'
        AND pr.action_at::date = now()::date
    ) x
  );
$$;

COMMENT ON FUNCTION public.rpc_return_phones_by_employee(bigint[], uuid) IS 'Backend-only: return phones using employee_id';
COMMENT ON FUNCTION public.rpc_consume_phones_by_employee(bigint[], uuid) IS 'Backend-only: consume phones using employee_id';
COMMENT ON FUNCTION public.rpc_phone_stats_by_employee(uuid, uuid) IS 'Backend-only: phone stats using employee_id';
