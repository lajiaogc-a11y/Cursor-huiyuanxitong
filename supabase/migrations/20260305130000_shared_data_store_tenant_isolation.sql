-- 为 shared_data_store 增加租户维度，实现租户配置隔离
-- 每个租户的配置（汇率、手续费等）仅对该租户内部员工可见

-- 1. 添加 tenant_id 列（可空，用于迁移）
ALTER TABLE public.shared_data_store ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2. 将现有数据迁移到 platform 租户
UPDATE public.shared_data_store
SET tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1)
WHERE tenant_id IS NULL;

-- 3. 若 platform 租户不存在，迁移到第一个租户（兼容旧环境）
UPDATE public.shared_data_store
SET tenant_id = (SELECT id FROM public.tenants ORDER BY tenant_code LIMIT 1)
WHERE tenant_id IS NULL;


-- 4. 设置 NOT NULL（若仍有 null 则跳过，避免迁移失败）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shared_data_store WHERE tenant_id IS NULL) THEN
    RAISE NOTICE 'Some shared_data_store rows have no tenant_id, keeping nullable';
  ELSE
    ALTER TABLE public.shared_data_store ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set tenant_id NOT NULL: %', SQLERRM;
END $$;

-- 5. 删除旧唯一约束，创建新唯一约束 (tenant_id, data_key)
ALTER TABLE public.shared_data_store DROP CONSTRAINT IF EXISTS shared_data_store_data_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS shared_data_store_tenant_key_unique
  ON public.shared_data_store (tenant_id, data_key);

-- 6. 更新索引
DROP INDEX IF EXISTS idx_shared_data_store_key;
CREATE INDEX IF NOT EXISTS idx_shared_data_store_tenant_key
  ON public.shared_data_store (tenant_id, data_key);

-- 7. 更新 RLS 策略：按租户隔离
DROP POLICY IF EXISTS shared_data_store_employee_select ON public.shared_data_store;
DROP POLICY IF EXISTS shared_data_store_employee_insert ON public.shared_data_store;
DROP POLICY IF EXISTS shared_data_store_employee_update ON public.shared_data_store;
DROP POLICY IF EXISTS shared_data_store_employee_delete ON public.shared_data_store;

-- 普通用户：只能访问本租户数据
CREATE POLICY shared_data_store_tenant_select ON public.shared_data_store
  FOR SELECT TO authenticated
  USING (
    (tenant_id = (
      SELECT e.tenant_id FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() LIMIT 1
    ))
    OR public.is_platform_super_admin(auth.uid())
  );

CREATE POLICY shared_data_store_tenant_insert ON public.shared_data_store
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = (
      SELECT e.tenant_id FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() LIMIT 1
    ))
    OR public.is_platform_super_admin(auth.uid())
  );

CREATE POLICY shared_data_store_tenant_update ON public.shared_data_store
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = (
      SELECT e.tenant_id FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() LIMIT 1
    ))
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    (tenant_id = (
      SELECT e.tenant_id FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() LIMIT 1
    ))
    OR public.is_platform_super_admin(auth.uid())
  );

CREATE POLICY shared_data_store_tenant_delete ON public.shared_data_store
  FOR DELETE TO authenticated
  USING (
    (tenant_id = (
      SELECT e.tenant_id FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() LIMIT 1
    ))
    OR public.is_platform_super_admin(auth.uid())
  );
