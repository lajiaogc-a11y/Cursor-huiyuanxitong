-- 平台总管理员(admin)不应出现在任何业务租户(002/003等)的员工列表中
-- 平台后台是网站级，其下开设的是租户；admin 属于 platform 租户，与业务租户无关

-- 1. 再次确保 admin 归属 platform 租户（防止数据被改回）
DO $$
DECLARE
  v_platform_tenant_id uuid;
  v_updated int := 0;
BEGIN
  SELECT id INTO v_platform_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_platform_tenant_id IS NOT NULL THEN
    UPDATE public.employees e
    SET tenant_id = v_platform_tenant_id
    WHERE e.username = 'admin'
      AND e.is_super_admin = true
      AND (e.tenant_id IS NULL OR e.tenant_id != v_platform_tenant_id);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      RAISE NOTICE '已将 % 个平台总管理员归属到 platform 租户', v_updated;
    END IF;
  END IF;
END $$;

-- 2. 修改 platform_get_tenant_employees_full：查看业务租户时排除平台总管理员
-- 平台总管理员(admin)属于 platform 租户，不应出现在 002/003 等业务租户的员工列表中
CREATE OR REPLACE FUNCTION public.platform_get_tenant_employees_full(p_tenant_id uuid)
RETURNS SETOF public.employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_code text;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  SELECT t.tenant_code INTO v_tenant_code
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  LIMIT 1;

  RETURN QUERY
  SELECT e.*
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    -- 查看业务租户(非 platform)时，排除平台总管理员(username=admin 且 is_super_admin)
    AND (
      v_tenant_code = 'platform'
      OR NOT (e.username = 'admin' AND e.is_super_admin = true)
    )
  ORDER BY e.created_at ASC;
END;
$fn$;
