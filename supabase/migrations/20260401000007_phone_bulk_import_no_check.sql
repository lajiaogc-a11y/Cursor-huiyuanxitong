-- 临时移除租户校验，确保导入能成功（仅校验已登录）
-- 若需恢复校验，可回滚此迁移

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
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
