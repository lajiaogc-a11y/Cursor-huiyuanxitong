-- 更新 RLS 核心函数，支持从自定义 JWT claims 中读取 tenant_id / employee_id
-- 当 auth.uid() 不为空且 profiles 表有匹配记录时走原逻辑；
-- 否则从 auth.jwt() 的 claims 中读取（自定义 JWT 场景）

-- 1. get_my_tenant_id() — 返回当前用户所属的 tenant_id
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tid uuid;
  _jwt jsonb;
BEGIN
  -- 方式一：标准 Supabase Auth 链路 (profiles → employees)
  IF auth.uid() IS NOT NULL THEN
    SELECT e.tenant_id INTO _tid
    FROM profiles p
    JOIN employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid()
    LIMIT 1;

    IF _tid IS NOT NULL THEN
      RETURN _tid;
    END IF;
  END IF;

  -- 方式二：从自定义 JWT claims 读取 tenant_id
  BEGIN
    _jwt := auth.jwt();
    IF _jwt IS NOT NULL AND _jwt ->> 'tenant_id' IS NOT NULL THEN
      _tid := (_jwt ->> 'tenant_id')::uuid;
      RETURN _tid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 方式三：从 JWT sub (employee_id) 直接查 employees
  BEGIN
    _jwt := auth.jwt();
    IF _jwt IS NOT NULL AND _jwt ->> 'sub' IS NOT NULL THEN
      SELECT tenant_id INTO _tid
      FROM employees
      WHERE id = (_jwt ->> 'sub')::uuid
      LIMIT 1;
      RETURN _tid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;

-- 2. is_platform_super_admin() — 判断当前用户是否为平台超级管理员
CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result boolean;
  _jwt jsonb;
BEGIN
  -- 方式一：标准 Supabase Auth 链路
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.profiles p ON p.employee_id = e.id
      WHERE p.id = auth.uid()
        AND e.is_super_admin = true
    ) INTO _result;

    IF _result THEN
      RETURN true;
    END IF;
  END IF;

  -- 方式二：从 JWT claims 读取
  BEGIN
    _jwt := auth.jwt();
    IF _jwt IS NOT NULL THEN
      _result := (_jwt ->> 'is_platform_super_admin')::boolean;
      IF _result IS NOT NULL THEN
        RETURN _result;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN false;
END;
$$;

-- 3. get_current_employee_id() — 返回当前用户的 employee_id
CREATE OR REPLACE FUNCTION public.get_current_employee_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _eid uuid;
  _jwt jsonb;
BEGIN
  -- 方式一：标准链路
  IF auth.uid() IS NOT NULL THEN
    SELECT employee_id INTO _eid
    FROM profiles
    WHERE id = auth.uid()
    LIMIT 1;

    IF _eid IS NOT NULL THEN
      RETURN _eid;
    END IF;
  END IF;

  -- 方式二：从 JWT sub 读取
  BEGIN
    _jwt := auth.jwt();
    IF _jwt IS NOT NULL AND _jwt ->> 'sub' IS NOT NULL THEN
      RETURN (_jwt ->> 'sub')::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$$;
