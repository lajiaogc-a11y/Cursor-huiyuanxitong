-- 平台总管理员应归属 platform 租户，独立于业务租户(002/003/004)
-- 背景：admin 等平台总管理被错误归属到 002，应移至 platform 租户

DO $$
DECLARE
  v_platform_tenant_id uuid;
  v_updated_count int := 0;
BEGIN
  -- 1. 确保 platform 租户存在
  SELECT id INTO v_platform_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_platform_tenant_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('platform', '平台管理', 'active')
    RETURNING id INTO v_platform_tenant_id;
    RAISE NOTICE '已创建 platform 租户 (id: %)', v_platform_tenant_id;
  END IF;

  -- 2. 仅将平台总管理(admin)移至 platform，租户总管理(wangchao等)保持在各租户
  -- 通过 username='admin' 识别平台总管理；租户总管理由各租户 admin_employee_id 标识
  UPDATE public.employees e
  SET tenant_id = v_platform_tenant_id
  WHERE e.username = 'admin'
    AND e.is_super_admin = true
    AND (e.tenant_id IS NULL OR e.tenant_id != v_platform_tenant_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '已将 % 个平台总管理员归属到 platform 租户', v_updated_count;

  -- 3. 更新 platform 租户的 admin_employee_id（指向第一个平台总管理员）
  UPDATE public.tenants t
  SET admin_employee_id = (
    SELECT e.id FROM public.employees e
    WHERE e.tenant_id = v_platform_tenant_id AND e.is_super_admin = true
    LIMIT 1
  )
  WHERE t.tenant_code = 'platform' AND t.id = v_platform_tenant_id;
END $$;
