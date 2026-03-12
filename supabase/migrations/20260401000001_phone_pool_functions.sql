-- Phone Extractor: normalization and RPCs

CREATE OR REPLACE FUNCTION normalize_phone(raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL OR trim(raw) = '' THEN NULL
    WHEN regexp_replace(trim(raw), '\D', '', 'g') ~ '^234' AND length(regexp_replace(trim(raw), '\D', '', 'g')) >= 10 THEN
      '0' || substr(regexp_replace(trim(raw), '\D', '', 'g'), 4)
    ELSE regexp_replace(trim(raw), '\D', '', 'g')
  END;
$$;

-- Bulk import: insert raw lines, normalize, dedupe per tenant
CREATE OR REPLACE FUNCTION phone_bulk_import(p_tenant_id UUID, lines TEXT[])
RETURNS TABLE(inserted_count INT, skipped_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s TEXT;
  norm TEXT;
  inserted INT := 0;
  skipped INT := 0;
BEGIN
  FOREACH s IN ARRAY lines LOOP
    norm := normalize_phone(s);
    IF norm IS NULL OR length(norm) < 6 THEN
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    BEGIN
      INSERT INTO phone_pool (tenant_id, raw_value, normalized, status)
      VALUES (p_tenant_id, s, norm, 'available')
      ON CONFLICT (tenant_id, normalized) DO NOTHING;
      IF FOUND THEN inserted := inserted + 1; ELSE skipped := skipped + 1; END IF;
    EXCEPTION WHEN unique_violation THEN skipped := skipped + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT inserted, skipped;
END;
$$;

-- Extract N numbers for a user: atomically mark available -> reserved (uses auth.uid())
CREATE OR REPLACE FUNCTION rpc_extract_phones(p_tenant_id UUID, p_limit_count INT)
RETURNS TABLE(id BIGINT, normalized TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_limit INT;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_limit_count <= 0 THEN RETURN; END IF;

  v_limit := LEAST(p_limit_count, (SELECT per_extract_limit FROM phone_extract_settings WHERE id = 1));

  IF (SELECT COALESCE(COUNT(*),0) FROM phone_reservations
      WHERE user_id = v_user AND action = 'extract'
      AND action_at::date = now()::date) >= (SELECT per_user_daily_limit FROM phone_extract_settings WHERE id = 1)
  THEN
    RAISE EXCEPTION 'daily_limit_exceeded';
  END IF;

  FOR rec IN
    SELECT pp.id, pp.normalized FROM phone_pool pp
    WHERE pp.tenant_id = p_tenant_id AND pp.status = 'available'
    ORDER BY pp.id
    FOR UPDATE OF pp SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE phone_pool SET status = 'reserved', reserved_by = v_user, reserved_at = now() WHERE id = rec.id;
    INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (rec.id, v_user, 'extract');
    RETURN QUERY SELECT rec.id, rec.normalized;
  END LOOP;
END;
$$;

-- Return phones by id (uses auth.uid()) - only return phones reserved by current user
CREATE OR REPLACE FUNCTION rpc_return_phones(phone_ids BIGINT[])
RETURNS TABLE(returned_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  pid BIGINT;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  FOREACH pid IN ARRAY phone_ids LOOP
    UPDATE phone_pool
    SET status = 'available', reserved_by = NULL, reserved_at = NULL
    WHERE id = pid AND reserved_by = v_user;
    IF FOUND THEN
      INSERT INTO phone_reservations (phone_pool_id, user_id, action) VALUES (pid, v_user, 'return');
      RETURN QUERY SELECT pid;
    END IF;
  END LOOP;
END;
$$;

-- Get pool counts & user consumption (uses auth.uid())
CREATE OR REPLACE FUNCTION rpc_phone_stats(p_tenant_id UUID)
RETURNS TABLE(total_available INT, total_reserved INT, user_today_extracted INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
SELECT
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'available'),
  (SELECT COUNT(*)::INT FROM phone_pool WHERE tenant_id = p_tenant_id AND status = 'reserved'),
  (SELECT COUNT(*)::INT FROM phone_reservations WHERE user_id = auth.uid() AND action='extract' AND action_at::date = now()::date);
$$;

-- Admin only: clear pool for tenant
CREATE OR REPLACE FUNCTION rpc_clear_phone_pool(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM phone_reservations WHERE phone_pool_id IN (SELECT id FROM phone_pool WHERE tenant_id = p_tenant_id);
  DELETE FROM phone_pool WHERE tenant_id = p_tenant_id;
END;
$$;

-- Get extract settings (for UI)
CREATE OR REPLACE FUNCTION rpc_phone_extract_settings()
RETURNS TABLE(per_extract_limit INT, per_user_daily_limit INT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
SELECT per_extract_limit, per_user_daily_limit FROM phone_extract_settings WHERE id = 1;
$$;
