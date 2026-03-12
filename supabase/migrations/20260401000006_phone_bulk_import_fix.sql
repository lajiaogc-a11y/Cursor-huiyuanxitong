-- 修复号码导入：放宽租户校验，支持通过 employee 或 email 匹配的租户
-- 原逻辑依赖 get_my_tenant_id()，当 profiles.employee_id 为空时可能返回 NULL 导致导入失败

CREATE OR REPLACE FUNCTION phone_bulk_import(p_tenant_id UUID, lines TEXT[])
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

  -- 校验：平台超管可导入任意租户；否则需有该租户的访问权限
  IF public.is_platform_super_admin(auth.uid()) THEN
    v_can_import := true;
  ELSE
    -- 用户有该租户的 employee 记录即可（profiles.employee_id 或 email 匹配）
    SELECT EXISTS (
      SELECT 1 FROM profiles p
      JOIN employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id = p_tenant_id
    ) OR EXISTS (
      SELECT 1 FROM profiles p
      JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
      WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
        AND e.tenant_id = p_tenant_id
    ) INTO v_can_import;
  END IF;

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
