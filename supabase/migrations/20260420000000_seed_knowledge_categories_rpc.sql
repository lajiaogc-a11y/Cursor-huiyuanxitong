-- 通过 RPC 插入默认公司文档分类，绕过 tenant_id 等约束（使用 service_role 或直接调用）
CREATE OR REPLACE FUNCTION public.rpc_seed_knowledge_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_tenant_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.knowledge_categories LIMIT 1) THEN
    RETURN jsonb_build_object('seeded', false, 'message', '已有分类，跳过');
  END IF;

  -- 获取任意可用 tenant_id（若表有该列）
  SELECT id INTO v_tenant_id FROM public.tenants WHERE tenant_code = 'platform' LIMIT 1;
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.employees WHERE tenant_id IS NOT NULL LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.members WHERE tenant_id IS NOT NULL LIMIT 1;
  END IF;

  -- 检查表是否有 tenant_id 列
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_categories' AND column_name = 'tenant_id'
  ) AND v_tenant_id IS NOT NULL THEN
    INSERT INTO public.knowledge_categories (tenant_id, name, content_type, sort_order, visibility)
    VALUES
      (v_tenant_id, '公司通知', 'text', 1, 'public'),
      (v_tenant_id, '行业知识', 'text', 2, 'public'),
      (v_tenant_id, '兑卡指南', 'image', 3, 'public'),
      (v_tenant_id, '常用话术', 'phrase', 4, 'public');
  ELSIF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_categories' AND column_name = 'tenant_id'
  ) THEN
    INSERT INTO public.knowledge_categories (name, content_type, sort_order, visibility)
    VALUES
      ('公司通知', 'text', 1, 'public'),
      ('行业知识', 'text', 2, 'public'),
      ('兑卡指南', 'image', 3, 'public'),
      ('常用话术', 'phrase', 4, 'public');
  ELSE
    RAISE EXCEPTION 'tenant_id required but no tenant found. Run: SELECT id FROM tenants LIMIT 1; then INSERT with that id.';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('seeded', true, 'count', v_count);
END;
$$;
