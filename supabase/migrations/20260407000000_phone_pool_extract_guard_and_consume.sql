-- Phone pool enhancements:
-- 1) Prevent extracting again when user still has reserved phones in current tenant.
-- 2) Add rpc_consume_phones for password-confirmed delete behavior in UI.

CREATE OR REPLACE FUNCTION rpc_extract_phones(p_tenant_id UUID, p_limit_count INT)
RETURNS TABLE(id BIGINT, normalized TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_limit INT;
  v_user UUID := auth.uid();
  v_daily_limit INT := 0;
  v_actions_used INT := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  IF p_limit_count <= 0 THEN
    RETURN;
  END IF;

  -- Guard: if user still holds any reserved numbers in this tenant,
  -- disallow extracting new numbers until returned/consumed.
  IF EXISTS (
    SELECT 1
    FROM phone_pool pp
    WHERE pp.tenant_id = p_tenant_id
      AND pp.status = 'reserved'
      AND pp.reserved_by = v_user
  ) THEN
    RAISE EXCEPTION 'has_unreturned_phones';
  END IF;

  SELECT per_extract_limit, per_user_daily_limit
    INTO v_limit, v_daily_limit
  FROM phone_extract_settings
  WHERE id = 1;

  v_limit := LEAST(p_limit_count, COALESCE(v_limit, 100));

  SELECT COALESCE(COUNT(*), 0)::INT
    INTO v_actions_used
  FROM phone_reservations
  WHERE user_id = v_user
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
      SET status = 'reserved', reserved_by = v_user, reserved_at = now()
    WHERE p.id = rec.id;

    INSERT INTO phone_reservations (phone_pool_id, user_id, action)
    VALUES (rec.id, v_user, 'extract');

    RETURN QUERY SELECT rec.id, rec.normalized;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_consume_phones(phone_ids BIGINT[])
RETURNS TABLE(consumed_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF phone_ids IS NULL OR array_length(phone_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
       SET status = 'consumed',
           reserved_by = NULL,
           reserved_at = NULL
     WHERE id = pid
       AND reserved_by = v_user
       AND status = 'reserved';

    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action)
      VALUES (pid, v_user, 'consume');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_consume_phones(bigint[]) TO authenticated;

