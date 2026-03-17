-- 支持通过 employee_id 提取号码（供后端 API 使用，绕过 auth.uid()）
-- 员工使用 JWT 登录时 Supabase auth.uid() 为 null，导致提取失败

CREATE OR REPLACE FUNCTION public.rpc_extract_phones_by_employee(
  p_tenant_id uuid,
  p_limit_count int,
  p_employee_id uuid
)
RETURNS TABLE(id bigint, normalized text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_limit int;
  v_daily_limit int := 0;
  v_actions_used int := 0;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  IF p_limit_count <= 0 THEN
    RETURN;
  END IF;

  -- 校验员工属于该租户或有权限
  IF NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = p_employee_id
      AND (e.tenant_id = p_tenant_id OR e.is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'forbidden_tenant_mismatch';
  END IF;

  -- 已有未归还号码则禁止再提取
  IF EXISTS (
    SELECT 1 FROM phone_pool pp
    WHERE pp.tenant_id = p_tenant_id
      AND pp.status = 'reserved'
      AND pp.reserved_by = p_employee_id
  ) THEN
    RAISE EXCEPTION 'has_unreturned_phones';
  END IF;

  SELECT s.per_extract_limit, s.per_user_daily_limit
    INTO v_limit, v_daily_limit
  FROM phone_extract_settings s WHERE s.id = 1;

  v_limit := LEAST(p_limit_count, COALESCE(v_limit, 100));

  SELECT COALESCE(COUNT(*), 0)::int INTO v_actions_used
  FROM phone_reservations
  WHERE user_id = p_employee_id
    AND action = 'extract'
    AND action_at::date = now()::date;

  IF v_actions_used >= COALESCE(v_daily_limit, 5) THEN
    RAISE EXCEPTION 'daily_limit_exceeded';
  END IF;

  FOR rec IN
    SELECT pp.id, pp.normalized
    FROM phone_pool pp
    WHERE pp.tenant_id = p_tenant_id
      AND pp.status = 'available'
    ORDER BY pp.id
    FOR UPDATE OF pp SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE phone_pool p
    SET status = 'reserved', reserved_by = p_employee_id, reserved_at = now()
    WHERE p.id = rec.id;

    INSERT INTO phone_reservations (phone_pool_id, user_id, action)
    VALUES (rec.id, p_employee_id, 'extract');

    RETURN QUERY SELECT rec.id, rec.normalized;
  END LOOP;
END;
$$;

-- 仅 service_role 可调用（后端使用 pg 直连时以 postgres 身份执行）
-- 不 GRANT 给 anon/authenticated，防止前端直接调用
COMMENT ON FUNCTION public.rpc_extract_phones_by_employee(uuid, int, uuid) IS
  'Backend-only: extract phones using employee_id instead of auth.uid()';

NOTIFY pgrst, 'reload schema';
