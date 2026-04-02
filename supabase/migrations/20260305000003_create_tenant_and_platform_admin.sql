-- 租户管理：tenants 表、create_tenant_with_admin、check_tenant_create_conflicts、
-- list_tenants_for_platform_admin、is_platform_super_admin、update_tenant_basic_info、reset_tenant_admin_password
-- 若表/列已存在则跳过，函数使用 CREATE OR REPLACE

-- 1. tenants 表（若不存在则创建）
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code text NOT NULL UNIQUE,
  tenant_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  admin_employee_id uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. employees 添加 tenant_id（若不存在）
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 3. 平台超级管理员判断：当前用户是 platform 租户下 is_super_admin=true 的员工
DROP FUNCTION IF EXISTS public.is_platform_super_admin(uuid);
CREATE FUNCTION public.is_platform_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.employees e ON e.id = p.employee_id
    JOIN public.tenants t ON t.id = e.tenant_id
    WHERE p.id = p_user_id
      AND t.tenant_code = 'platform'
      AND e.is_super_admin = true
  )
$$;

-- 4. 检查创建租户冲突
DROP FUNCTION IF EXISTS public.check_tenant_create_conflicts(text, text, text);
CREATE OR REPLACE FUNCTION public.check_tenant_create_conflicts(
  p_tenant_code text,
  p_admin_username text,
  p_admin_real_name text
)
RETURNS TABLE(tenant_code_exists boolean, admin_username_exists boolean, admin_real_name_exists boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    EXISTS(SELECT 1 FROM public.tenants WHERE tenant_code = trim(p_tenant_code)),
    EXISTS(SELECT 1 FROM public.employees WHERE username = trim(p_admin_username)),
    EXISTS(SELECT 1 FROM public.employees WHERE real_name = trim(p_admin_real_name));
END;
$fn$;

-- 5. 创建租户及管理员
DROP FUNCTION IF EXISTS public.create_tenant_with_admin(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(
  p_tenant_code text,
  p_tenant_name text,
  p_admin_username text,
  p_admin_real_name text,
  p_admin_password text
)
RETURNS TABLE(success boolean, error_code text, tenant_id uuid, admin_employee_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_admin_id uuid;
  v_platform_tenant_id uuid;
BEGIN
  -- 权限：仅平台超级管理员
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 冲突检查
  IF EXISTS(SELECT 1 FROM public.tenants WHERE tenant_code = trim(p_tenant_code)) THEN
    RETURN QUERY SELECT false, 'TENANT_CODE_EXISTS'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.employees WHERE username = trim(p_admin_username)) THEN
    RETURN QUERY SELECT false, 'ADMIN_USERNAME_EXISTS'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.employees WHERE real_name = trim(p_admin_real_name)) THEN
    RETURN QUERY SELECT false, 'ADMIN_REAL_NAME_EXISTS'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- 创建租户（先不设 admin_employee_id）
  INSERT INTO public.tenants (tenant_code, tenant_name, status)
  VALUES (trim(p_tenant_code), trim(p_tenant_name), 'active')
  RETURNING id INTO v_tenant_id;

  -- 创建管理员员工（密码由 hash_employee_password 触发器处理）
  INSERT INTO public.employees (username, real_name, password_hash, role, status, visible, tenant_id)
  VALUES (
    trim(p_admin_username),
    trim(p_admin_real_name),
    COALESCE(NULLIF(trim(p_admin_password), ''), 'changeme'),
    'admin',
    'active',
    true,
    v_tenant_id
  )
  RETURNING id INTO v_admin_id;

  -- 更新租户的 admin_employee_id
  UPDATE public.tenants SET admin_employee_id = v_admin_id, updated_at = now() WHERE id = v_tenant_id;

  RETURN QUERY SELECT true, NULL::text, v_tenant_id, v_admin_id;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, 'DUPLICATE_KEY'::text, NULL::uuid, NULL::uuid;
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'CREATE_FAILED'::text, NULL::uuid, NULL::uuid;
END;
$fn$;

-- 6. 平台管理员列出所有租户
DROP FUNCTION IF EXISTS public.list_tenants_for_platform_admin();
CREATE OR REPLACE FUNCTION public.list_tenants_for_platform_admin()
RETURNS TABLE(
  id uuid,
  tenant_code text,
  tenant_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  admin_employee_id uuid,
  admin_username text,
  admin_real_name text,
  admin_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.tenant_code,
    t.tenant_name,
    t.status,
    t.created_at,
    t.updated_at,
    t.admin_employee_id,
    ea.username AS admin_username,
    ea.real_name AS admin_real_name,
    (SELECT count(*)::bigint FROM public.employees e WHERE e.tenant_id = t.id AND e.role = 'admin') AS admin_count
  FROM public.tenants t
  LEFT JOIN public.employees ea ON ea.id = t.admin_employee_id
  ORDER BY t.tenant_code;
END;
$fn$;

-- 7. 更新租户基本信息
DROP FUNCTION IF EXISTS public.update_tenant_basic_info(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.update_tenant_basic_info(
  p_tenant_id uuid,
  p_tenant_code text,
  p_tenant_name text,
  p_status text
)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text;
    RETURN;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RETURN QUERY SELECT false, 'TENANT_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF EXISTS(SELECT 1 FROM public.tenants WHERE tenant_code = trim(p_tenant_code) AND id != p_tenant_id) THEN
    RETURN QUERY SELECT false, 'TENANT_CODE_EXISTS'::text;
    RETURN;
  END IF;

  UPDATE public.tenants
  SET tenant_code = trim(p_tenant_code), tenant_name = trim(p_tenant_name), status = trim(p_status), updated_at = now()
  WHERE id = p_tenant_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$fn$;

-- 8. 重置租户管理员密码
DROP FUNCTION IF EXISTS public.reset_tenant_admin_password(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.reset_tenant_admin_password(
  p_tenant_id uuid,
  p_admin_employee_id uuid DEFAULT NULL,
  p_new_password text DEFAULT NULL
)
RETURNS TABLE(success boolean, error_code text, admin_employee_id uuid, admin_username text, admin_real_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_emp_id uuid;
  v_username text;
  v_real_name text;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  v_emp_id := COALESCE(p_admin_employee_id, (SELECT admin_employee_id FROM public.tenants WHERE id = p_tenant_id LIMIT 1));
  IF v_emp_id IS NULL THEN
    RETURN QUERY SELECT false, 'ADMIN_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_new_password IS NULL OR trim(p_new_password) = '' THEN
    RETURN QUERY SELECT false, 'INVALID_PASSWORD'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT e.username, e.real_name INTO v_username, v_real_name FROM public.employees e WHERE e.id = v_emp_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'ADMIN_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.employees
  SET password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_emp_id;

  RETURN QUERY SELECT true, NULL::text, v_emp_id, v_username, v_real_name;
END;
$fn$;
