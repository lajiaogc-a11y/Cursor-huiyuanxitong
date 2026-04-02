-- 号码池：GRANT EXECUTE + 确保 phone_bulk_import 能正确写入
-- 1. 授予 authenticated 和 service_role 执行权限
-- 2. phone_bulk_import 增加租户校验，防止跨租户写入
-- 3. 确保函数以 definer 权限执行，绕过 RLS 写入

-- GRANT EXECUTE
GRANT EXECUTE ON FUNCTION public.phone_bulk_import(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phone_bulk_import(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_extract_phones(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_return_phones(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_phone_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_clear_phone_pool(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_phone_extract_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_phone_extract_records(uuid, integer) TO authenticated;

-- 重新创建 phone_bulk_import，增加租户校验，确保只能写入本租户
CREATE OR REPLACE FUNCTION phone_bulk_import(p_tenant_id UUID, lines TEXT[])
RETURNS TABLE(inserted_count INT, skipped_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s TEXT;
  norm TEXT;
  inserted INT := 0;
  skipped INT := 0;
  v_my_tenant UUID;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;

  -- 校验：非平台超管只能导入本租户
  v_my_tenant := public.get_my_tenant_id();
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    IF v_my_tenant IS NULL THEN
      RAISE EXCEPTION 'tenant_not_found';
    END IF;
    IF v_my_tenant != p_tenant_id THEN
      RAISE EXCEPTION 'forbidden_tenant_mismatch';
    END IF;
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
