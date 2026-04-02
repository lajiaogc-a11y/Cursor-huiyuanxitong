# 公司文档看不到 - 修复指南

## 问题
公司文档页面显示「暂无公司文档分类」，点击「初始化默认分类」也失败（tenant_id 相关错误）。

## 快速修复

### 方式 A：本地脚本（推荐，需配置 DATABASE_URL 或 SUPABASE_URL + DATABASE_PASSWORD）

```bash
npm run db:seed-knowledge-migration
```

脚本会通过直接数据库连接创建 RPC 并填充默认分类。

### 方式 B：Supabase SQL Editor（复制整段执行）

1. 打开 [Supabase 控制台](https://supabase.com/dashboard) → 选择项目 → **SQL Editor**
2. 新建查询，**完整复制**下面 SQL，点击 Run：

```sql
-- 一键修复：创建 RPC 并初始化
CREATE OR REPLACE FUNCTION public.rpc_seed_knowledge_categories()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant_id uuid; v_has_tenant_col boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM public.knowledge_categories LIMIT 1) THEN
    RETURN jsonb_build_object('seeded', false, 'message', '已有分类');
  END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='knowledge_categories' AND column_name='tenant_id') INTO v_has_tenant_col;
  SELECT id INTO v_tenant_id FROM public.tenants WHERE tenant_code='platform' LIMIT 1;
  IF v_tenant_id IS NULL THEN SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1; END IF;
  IF v_tenant_id IS NULL THEN SELECT tenant_id INTO v_tenant_id FROM public.employees WHERE tenant_id IS NOT NULL LIMIT 1; END IF;
  IF v_tenant_id IS NULL THEN SELECT tenant_id INTO v_tenant_id FROM public.members WHERE tenant_id IS NOT NULL LIMIT 1; END IF;
  IF v_has_tenant_col AND v_tenant_id IS NOT NULL THEN
    INSERT INTO public.knowledge_categories (tenant_id, name, content_type, sort_order, visibility)
    VALUES (v_tenant_id,'公司通知','text',1,'public'),(v_tenant_id,'行业知识','text',2,'public'),(v_tenant_id,'兑卡指南','image',3,'public'),(v_tenant_id,'常用话术','phrase',4,'public');
  ELSE
    INSERT INTO public.knowledge_categories (name, content_type, sort_order, visibility)
    VALUES ('公司通知','text',1,'public'),('行业知识','text',2,'public'),('兑卡指南','image',3,'public'),('常用话术','phrase',4,'public');
  END IF;
  RETURN jsonb_build_object('seeded', true, 'count', 4);
END; $$;
SELECT rpc_seed_knowledge_categories();
```

3. 执行成功后，**刷新公司文档页面**（F5 或 Ctrl+R）。

## 详细步骤（若上面失败）

### 方法一：分步执行

**步骤 1：创建 RPC 函数**（若尚未创建）
```sql
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
  ELSE
    INSERT INTO public.knowledge_categories (name, content_type, sort_order, visibility)
    VALUES
      ('公司通知', 'text', 1, 'public'),
      ('行业知识', 'text', 2, 'public'),
      ('兑卡指南', 'image', 3, 'public'),
      ('常用话术', 'phrase', 4, 'public');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('seeded', true, 'count', v_count);
END;
$$;
```

**步骤 2：执行初始化**
```sql
SELECT rpc_seed_knowledge_categories();
```

4. 刷新公司文档页面，应能看到 4 个默认分类。

### 方法二：手动插入（若表无 tenant_id 列）

若 `knowledge_categories` 表**没有** `tenant_id` 列，可直接执行：

```sql
INSERT INTO public.knowledge_categories (name, content_type, sort_order, visibility) VALUES
  ('公司通知', 'text', 1, 'public'),
  ('行业知识', 'text', 2, 'public'),
  ('兑卡指南', 'image', 3, 'public'),
  ('常用话术', 'phrase', 4, 'public');
```

### 方法三：表有 tenant_id 且必填时

先查询租户 ID：
```sql
SELECT id, tenant_code FROM tenants LIMIT 5;
```

将下面 `YOUR_TENANT_ID` 替换为实际 ID 后执行：
```sql
INSERT INTO public.knowledge_categories (tenant_id, name, content_type, sort_order, visibility) VALUES
  ('YOUR_TENANT_ID', '公司通知', 'text', 1, 'public'),
  ('YOUR_TENANT_ID', '行业知识', 'text', 2, 'public'),
  ('YOUR_TENANT_ID', '兑卡指南', 'image', 3, 'public'),
  ('YOUR_TENANT_ID', '常用话术', 'phrase', 4, 'public');
```

## 员工账号看不到数据时

若数据库有数据但**员工账号登录看不到**，需修复员工权限：

```bash
npm run db:fix-knowledge-staff
```

或在 Supabase SQL Editor 中执行 `supabase/migrations/20260421000000_fix_knowledge_base_staff_permission.sql` 中的 SQL。

## 完成后

1. 确保后端已启动：`cd server && npm run dev`
2. 刷新公司文档页面（员工需重新登录以刷新权限）
3. 若仍看不到，检查浏览器控制台是否有 API 报错
