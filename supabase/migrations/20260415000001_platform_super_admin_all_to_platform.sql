-- 将平台总管理员归属到 platform 租户
-- 修复：平台总管理账号错误出现在 002 等业务租户中
-- 识别条件：username='admin' 且 is_super_admin=true（与 20260311400000 一致）

DO $$
DECLARE
  v_platform_tenant_id uuid;
  v_updated_count int := 0;
BEGIN
  SELECT id INTO v_platform_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_platform_tenant_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('platform', '平台管理', 'active')
    RETURNING id INTO v_platform_tenant_id;
    RAISE NOTICE '已创建 platform 租户 (id: %)', v_platform_tenant_id;
  END IF;

  -- 将平台总管理员(admin)移至 platform 租户
  UPDATE public.employees e
  SET tenant_id = v_platform_tenant_id
  WHERE e.username = 'admin'
    AND e.is_super_admin = true
    AND (e.tenant_id IS NULL OR e.tenant_id != v_platform_tenant_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count > 0 THEN
    RAISE NOTICE '已将 % 个平台总管理员归属到 platform 租户', v_updated_count;
  END IF;

  -- 更新 platform 租户的 admin_employee_id
  UPDATE public.tenants t
  SET admin_employee_id = (
    SELECT e.id FROM public.employees e
    WHERE e.tenant_id = v_platform_tenant_id AND e.is_super_admin = true
    ORDER BY e.created_at ASC
    LIMIT 1
  )
  WHERE t.tenant_code = 'platform' AND t.id = v_platform_tenant_id;
END $$;

NOTIFY pgrst, 'reload schema';
