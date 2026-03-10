-- 恢复租户 002 的所有数据
-- 背景：开发租户系统时，原有数据全部放在编号 002 租户。因员工 tenant_id 推断错误或未正确设置，导致数据不可见。
-- 本迁移：将 tenant_id 为 null 的员工全部归属到 002；若 002 不存在则创建（兼容首次迁移）。
--
-- 若数据仍不可见，可能是：1) 之前被错误推断到其他租户，需手动执行 restore_tenant_002_from_other_tenants.sql
-- 2) 数据已被 delete_tenant 删除，需从备份恢复。

DO $$
DECLARE
  v_tenant_002_id uuid;
  v_updated_count int := 0;
BEGIN
  -- 获取或创建租户 002
  SELECT id INTO v_tenant_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_tenant_002_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('002', '租户002', 'active')
    RETURNING id INTO v_tenant_002_id;
    RAISE NOTICE '已创建租户 002 (id: %)', v_tenant_002_id;
  END IF;

  -- ========== 1. 将 tenant_id 为 null 的员工归属到 002（排除平台总管理员 is_super_admin，他们应归属 platform 租户）==========
  UPDATE public.employees e
  SET tenant_id = v_tenant_002_id
  WHERE e.tenant_id IS NULL
    AND e.is_super_admin = false;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '已将 % 个 tenant_id 为 null 的员工归属到租户 002', v_updated_count;

  -- ========== 2. 已移除：原逻辑将其他租户(003/004/005)的普通员工错误改到 002，导致跨租户数据混乱 ==========
  -- 仅保留第 1 步：将 tenant_id 为 null 的员工归属到 002。其他租户的员工应保持其 tenant_id 不变。

END $$;
