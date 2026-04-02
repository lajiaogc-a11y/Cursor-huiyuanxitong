-- 号码池 bulk import、clear、update settings 的 employee_id 版本
-- 供后端 API 使用，绕过 auth.uid()

CREATE OR REPLACE FUNCTION public.phone_bulk_import_by_employee(
  p_tenant_id UUID,
  lines TEXT[],
  p_employee_id UUID
)
RETURNS TABLE(inserted_count INT, skipped_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s TEXT;
  norm TEXT;
  inserted INT := 0;
  skipped INT := 0;
  v_can_import BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = p_employee_id
      AND (e.tenant_id = p_tenant_id OR e.is_super_admin = true)
  ) INTO v_can_import;

  IF NOT v_can_import THEN
    RAISE EXCEPTION 'forbidden_tenant_mismatch';
  END IF;

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

CREATE OR REPLACE FUNCTION public.rpc_clear_phone_pool_by_employee(
  p_tenant_id UUID,
  p_employee_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_tenant_id UUID;
  v_is_platform BOOLEAN;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required';
  END IF;

  SELECT e.role, e.tenant_id, COALESCE(e.is_super_admin, false)
  INTO v_role, v_tenant_id, v_is_platform
  FROM employees e WHERE e.id = p_employee_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;
  IF v_role NOT IN ('admin', 'manager') AND NOT v_is_platform THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF NOT v_is_platform AND v_tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'forbidden_tenant_mismatch';
  END IF;

  DELETE FROM phone_reservations WHERE phone_pool_id IN (SELECT id FROM phone_pool WHERE tenant_id = p_tenant_id);
  DELETE FROM phone_pool WHERE tenant_id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_phone_extract_settings_by_employee(
  p_per_extract_limit INT DEFAULT NULL,
  p_per_user_daily_limit INT DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_platform BOOLEAN;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_id_required';
  END IF;

  SELECT e.role, COALESCE(e.is_super_admin, false)
  INTO v_role, v_is_platform
  FROM employees e WHERE e.id = p_employee_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;
  IF v_role NOT IN ('admin', 'manager') AND NOT v_is_platform THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;

  UPDATE phone_extract_settings
  SET
    per_extract_limit = CASE
      WHEN p_per_extract_limit IS NOT NULL AND p_per_extract_limit >= 1 AND p_per_extract_limit <= 10000
      THEN p_per_extract_limit ELSE per_extract_limit END,
    per_user_daily_limit = CASE
      WHEN p_per_user_daily_limit IS NOT NULL AND p_per_user_daily_limit >= 1 AND p_per_user_daily_limit <= 1000
      THEN p_per_user_daily_limit ELSE per_user_daily_limit END
  WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.phone_bulk_import_by_employee(uuid, text[], uuid) IS 'Backend-only: bulk import using employee_id';
COMMENT ON FUNCTION public.rpc_clear_phone_pool_by_employee(uuid, uuid) IS 'Backend-only: clear pool using employee_id';
COMMENT ON FUNCTION public.rpc_update_phone_extract_settings_by_employee(int, int, uuid) IS 'Backend-only: update settings using employee_id';
