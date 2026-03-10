-- 修复：租户总管理(wangchao等)被错误移至 platform，应恢复回各自租户
-- 区分：平台总管理(admin)=platform租户；租户总管理(wangchao)=002/003等租户
-- 逻辑：若某租户(非platform)的 admin_employee_id 指向的员工当前在 platform，则移回该租户

DO $$
DECLARE
  v_platform_tenant_id uuid;
  v_updated_count int := 0;
BEGIN
  SELECT id INTO v_platform_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_platform_tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- 将各业务租户的 admin_employee_id 所指向的员工，从 platform 移回其所属租户
  UPDATE public.employees e
  SET tenant_id = t.id
  FROM public.tenants t
  WHERE t.tenant_code != 'platform'
    AND t.admin_employee_id = e.id
    AND e.tenant_id = v_platform_tenant_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '已将 % 个租户总管理员从 platform 恢复回各自租户', v_updated_count;

  -- 确保 platform 租户的 admin_employee_id 指向仍留在 platform 的员工（优先 username='admin'）
  UPDATE public.tenants t
  SET admin_employee_id = (
    SELECT e.id FROM public.employees e
    WHERE e.tenant_id = v_platform_tenant_id AND e.is_super_admin = true
    ORDER BY CASE WHEN e.username = 'admin' THEN 0 ELSE 1 END
    LIMIT 1
  )
  WHERE t.tenant_code = 'platform' AND t.id = v_platform_tenant_id;
END $$;
