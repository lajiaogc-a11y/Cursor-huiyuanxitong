CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'manager',
    'staff'
);


--
-- Name: admin_reset_password(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_password(p_admin_id uuid, p_target_employee_id uuid, p_new_password text) RETURNS TABLE(success boolean, message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_role public.app_role;
BEGIN
  -- 允许传入 employee_id（employees.id）或 user_id（profiles.id）两种
  SELECT e.role
  INTO v_admin_role
  FROM public.employees e
  WHERE e.id = p_admin_id
  LIMIT 1;

  IF v_admin_role IS NULL THEN
    SELECT e.role
    INTO v_admin_role
    FROM public.profiles p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.id = p_admin_id
    LIMIT 1;
  END IF;

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'manager') THEN
    RETURN QUERY SELECT false, '无权限执行此操作';
    RETURN;
  END IF;

  UPDATE public.employees
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_target_employee_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '员工不存在';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, '密码重置成功';
END;
$$;


--
-- Name: calculate_member_points(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_member_points(p_member_code text, p_last_reset_time timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  total_points integer;
BEGIN
  IF p_last_reset_time IS NULL THEN
    -- 没有重置时间，计算所有有效积分
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status = 'issued';
  ELSE
    -- 有重置时间，只计算重置时间之后的积分
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status = 'issued'
      AND created_at >= p_last_reset_time;
  END IF;
  
  RETURN GREATEST(total_points, 0);
END;
$$;


--
-- Name: can_modify_name(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_modify_name(_employee_id uuid, _modifier_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    CASE 
      -- Staff cannot modify their own name
      WHEN _employee_id = _modifier_id AND 
           (SELECT role FROM public.employees WHERE id = _employee_id) = 'staff'
      THEN false
      -- Admin/Manager can modify anyone's name
      WHEN (SELECT role FROM public.employees WHERE id = _modifier_id) IN ('admin', 'manager')
      THEN true
      ELSE false
    END
$$;


--
-- Name: get_active_employees_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_employees_safe() RETURNS TABLE(id uuid, real_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT e.id, e.real_name
  FROM public.employees e
  WHERE e.status = 'active'
  ORDER BY e.created_at ASC;
$$;


--
-- Name: get_employee_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_employee_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT employee_id
  FROM public.profiles
  WHERE id = _user_id
$$;


--
-- Name: handle_new_user_employee(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_employee() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  emp_id uuid;
BEGIN
  -- Find employee by username
  SELECT id INTO emp_id 
  FROM public.employees 
  WHERE username = NEW.email 
  OR username = split_part(NEW.email, '@', 1)
  LIMIT 1;
  
  -- Insert profile with employee link
  INSERT INTO public.profiles (id, email, employee_id)
  VALUES (NEW.id, NEW.email, emp_id);
  
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.profiles p ON p.employee_id = e.id
    WHERE p.id = _user_id
      AND e.role = _role
  )
$$;


--
-- Name: hash_employee_password(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hash_employee_password() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := extensions.crypt(NEW.password_hash, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$_$;


--
-- Name: signup_employee(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signup_employee(p_username text, p_password text, p_real_name text) RETURNS TABLE(success boolean, error_code text, employee_id uuid, assigned_role public.app_role, assigned_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_first BOOLEAN;
  new_role app_role;
  new_status text;
  new_employee_id uuid;
BEGIN
  -- 检查用户名是否已存在
  IF EXISTS (SELECT 1 FROM employees WHERE username = p_username) THEN
    RETURN QUERY SELECT false, 'USERNAME_EXISTS'::text, NULL::uuid, NULL::app_role, NULL::text;
    RETURN;
  END IF;
  
  -- 检查是否是第一个用户（成为管理员）
  SELECT NOT EXISTS (SELECT 1 FROM employees LIMIT 1) INTO is_first;
  
  IF is_first THEN
    new_role := 'admin';
    new_status := 'active';  -- 第一个用户直接激活
  ELSE
    new_role := 'staff';
    new_status := 'pending';  -- 后续用户需要审批
  END IF;
  
  -- 创建员工记录
  INSERT INTO employees (username, real_name, password_hash, role, status, visible)
  VALUES (p_username, p_real_name, p_password, new_role, new_status, true)
  RETURNING id INTO new_employee_id;
  
  RETURN QUERY SELECT true, NULL::text, new_employee_id, new_role, new_status;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: verify_employee_login(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_employee_login(p_username text, p_password text) RETURNS TABLE(employee_id uuid, username text, real_name text, role public.app_role, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
BEGIN
  RETURN QUERY
  SELECT e.id, e.username, e.real_name, e.role, e.status
  FROM public.employees e
  WHERE e.username = p_username
    AND e.status = 'active'
    AND (
      (e.password_hash LIKE '$2%' AND e.password_hash = extensions.crypt(p_password, e.password_hash))
      OR
      (e.password_hash NOT LIKE '$2%' AND e.password_hash = p_password)
    );
END;
$_$;


--
-- Name: verify_employee_login_detailed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_employee_login_detailed(p_username text, p_password text) RETURNS TABLE(employee_id uuid, username text, real_name text, role public.app_role, status text, error_code text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_employee RECORD;
BEGIN
  SELECT e.id, e.username, e.real_name, e.role, e.status, e.password_hash
  INTO v_employee
  FROM public.employees e
  WHERE e.username = p_username;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, 'USER_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_employee.status != 'active' THEN
    RETURN QUERY SELECT v_employee.id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, 'ACCOUNT_DISABLED'::text;
    RETURN;
  END IF;

  IF (v_employee.password_hash LIKE '$2%' AND v_employee.password_hash = extensions.crypt(p_password, v_employee.password_hash))
     OR (v_employee.password_hash NOT LIKE '$2%' AND v_employee.password_hash = p_password) THEN
    RETURN QUERY SELECT v_employee.id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, NULL::text;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, 'WRONG_PASSWORD'::text;
  END IF;
END;
$_$;


SET default_table_access_method = heap;

--
-- Name: activity_gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_gifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency text NOT NULL,
    amount numeric NOT NULL,
    rate numeric NOT NULL,
    phone_number text NOT NULL,
    payment_agent text NOT NULL,
    gift_type text,
    fee numeric DEFAULT 0,
    gift_value numeric DEFAULT 0,
    remark text,
    creator_id uuid,
    member_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_reward_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_reward_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    min_points integer NOT NULL,
    max_points integer,
    reward_amount_ngn numeric(20,2) DEFAULT 0,
    reward_amount_ghs numeric(20,2) DEFAULT 0,
    reward_amount_usdt numeric(20,8) DEFAULT 0,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    value text NOT NULL,
    label text NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submitter_id uuid,
    target_table text NOT NULL,
    target_id uuid NOT NULL,
    action_type text NOT NULL,
    old_data jsonb,
    new_data jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewer_id uuid,
    review_time timestamp with time zone,
    review_comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_records_action_type_check CHECK ((action_type = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text]))),
    CONSTRAINT audit_records_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: card_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text,
    status text DEFAULT 'active'::text NOT NULL,
    remark text,
    card_vendors text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name_zh text NOT NULL,
    name_en text NOT NULL,
    symbol text DEFAULT ''::text,
    badge_color text DEFAULT 'bg-gray-100 text-gray-700 border-gray-200'::text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_name_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_name_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    old_name text NOT NULL,
    new_name text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text
);


--
-- Name: employee_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    permission_key text NOT NULL,
    can_edit_directly boolean DEFAULT false NOT NULL,
    requires_approval boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    real_name text NOT NULL,
    password_hash text NOT NULL,
    role public.app_role DEFAULT 'staff'::public.app_role NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    visible boolean DEFAULT false NOT NULL,
    CONSTRAINT employees_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);


--
-- Name: exchange_rate_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rate_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: member_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid,
    phone_number text,
    referral_count integer DEFAULT 0 NOT NULL,
    accumulated_points integer DEFAULT 0 NOT NULL,
    remaining_points integer DEFAULT 0 NOT NULL,
    referral_points integer DEFAULT 0 NOT NULL,
    last_reset_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    total_accumulated_ngn numeric DEFAULT 0,
    total_accumulated_ghs numeric DEFAULT 0,
    total_accumulated_usdt numeric DEFAULT 0,
    total_gift_ngn numeric DEFAULT 0,
    total_gift_ghs numeric DEFAULT 0,
    total_gift_usdt numeric DEFAULT 0,
    accumulated_profit numeric DEFAULT 0
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_code text NOT NULL,
    phone_number text NOT NULL,
    currency_preferences text[] DEFAULT '{}'::text[],
    bank_card text,
    member_level text DEFAULT '普通会员'::text,
    common_cards text[] DEFAULT '{}'::text[],
    customer_feature text,
    remark text,
    source_id uuid,
    recorder_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    creator_id uuid
);


--
-- Name: navigation_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.navigation_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nav_key text NOT NULL,
    display_text_zh text NOT NULL,
    display_text_en text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_visible boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    operator_id uuid,
    operator_account text NOT NULL,
    operator_role text NOT NULL,
    module text NOT NULL,
    operation_type text NOT NULL,
    object_id text,
    object_description text,
    before_data jsonb,
    after_data jsonb,
    ip_address text,
    is_restored boolean DEFAULT false,
    restored_by uuid,
    restored_at timestamp with time zone
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    sales_user_id uuid,
    order_type text NOT NULL,
    vendor_id text,
    card_merchant_id text,
    amount numeric(20,2) DEFAULT 0 NOT NULL,
    actual_payment numeric(20,2) DEFAULT 0,
    currency text,
    exchange_rate numeric(20,8),
    fee numeric(20,2) DEFAULT 0,
    profit_ngn numeric(20,2) DEFAULT 0,
    profit_usdt numeric(20,8) DEFAULT 0,
    card_value numeric(20,2) DEFAULT 0,
    payment_value numeric(20,2) DEFAULT 0,
    member_id uuid,
    phone_number text,
    status text DEFAULT 'pending'::text NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    creator_id uuid,
    order_points integer DEFAULT 0,
    points_status text DEFAULT 'none'::text,
    profit_rate numeric DEFAULT 0,
    CONSTRAINT orders_points_status_check CHECK ((points_status = ANY (ARRAY['none'::text, 'added'::text, 'reversed'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: payment_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: points_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_code text NOT NULL,
    phone text NOT NULL,
    current_points integer DEFAULT 0,
    points_accrual_start_time timestamp with time zone DEFAULT now() NOT NULL,
    current_cycle_id text,
    last_reset_time timestamp with time zone,
    last_updated timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: points_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    member_id uuid,
    order_id uuid,
    phone_number text,
    member_code text,
    actual_payment numeric(20,2),
    currency text,
    exchange_rate numeric(20,8),
    usd_amount numeric(20,2),
    points_multiplier numeric(10,2),
    points_earned integer DEFAULT 0 NOT NULL,
    transaction_type text NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    creator_id uuid,
    creator_name text,
    CONSTRAINT points_ledger_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'reversed'::text]))),
    CONSTRAINT points_ledger_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['consumption'::text, 'referral'::text, 'referral_1'::text, 'referral_2'::text, 'exchange'::text, 'reversal'::text])))
);


--
-- Name: points_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.points_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    total_issued_points bigint DEFAULT 0 NOT NULL,
    total_reversed_points bigint DEFAULT 0 NOT NULL,
    net_points bigint DEFAULT 0 NOT NULL,
    transaction_count integer DEFAULT 0 NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    employee_id uuid,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referral_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer_phone text NOT NULL,
    referrer_member_code text NOT NULL,
    referee_phone text NOT NULL,
    referee_member_code text NOT NULL,
    source text DEFAULT '转介绍'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: report_titles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_titles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_key text NOT NULL,
    title_zh text NOT NULL,
    title_en text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.app_role NOT NULL,
    module_name text NOT NULL,
    field_name text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shared_data_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_data_store (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_key text NOT NULL,
    data_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_data_store; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_data_store (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    data_key text NOT NULL,
    data_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_providers text[] DEFAULT '{}'::text[]
);


--
-- Name: activity_gifts activity_gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_gifts
    ADD CONSTRAINT activity_gifts_pkey PRIMARY KEY (id);


--
-- Name: activity_reward_tiers activity_reward_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_reward_tiers
    ADD CONSTRAINT activity_reward_tiers_pkey PRIMARY KEY (id);


--
-- Name: activity_types activity_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_types
    ADD CONSTRAINT activity_types_pkey PRIMARY KEY (id);


--
-- Name: activity_types activity_types_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_types
    ADD CONSTRAINT activity_types_value_key UNIQUE (value);


--
-- Name: audit_records audit_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records
    ADD CONSTRAINT audit_records_pkey PRIMARY KEY (id);


--
-- Name: card_types card_types_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_types
    ADD CONSTRAINT card_types_name_key UNIQUE (name);


--
-- Name: card_types card_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_types
    ADD CONSTRAINT card_types_pkey PRIMARY KEY (id);


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cards
    ADD CONSTRAINT cards_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_code_key UNIQUE (code);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: customer_sources customer_sources_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sources
    ADD CONSTRAINT customer_sources_name_key UNIQUE (name);


--
-- Name: customer_sources customer_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_sources
    ADD CONSTRAINT customer_sources_pkey PRIMARY KEY (id);


--
-- Name: data_settings data_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_settings
    ADD CONSTRAINT data_settings_pkey PRIMARY KEY (id);


--
-- Name: data_settings data_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_settings
    ADD CONSTRAINT data_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: employee_name_history employee_name_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_name_history
    ADD CONSTRAINT employee_name_history_pkey PRIMARY KEY (id);


--
-- Name: employee_permissions employee_permissions_employee_id_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_permissions
    ADD CONSTRAINT employee_permissions_employee_id_permission_key_key UNIQUE (employee_id, permission_key);


--
-- Name: employee_permissions employee_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_permissions
    ADD CONSTRAINT employee_permissions_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_real_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_real_name_key UNIQUE (real_name);


--
-- Name: employees employees_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_username_key UNIQUE (username);


--
-- Name: exchange_rate_state exchange_rate_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_state
    ADD CONSTRAINT exchange_rate_state_pkey PRIMARY KEY (id);


--
-- Name: exchange_rate_state exchange_rate_state_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_state
    ADD CONSTRAINT exchange_rate_state_user_id_key UNIQUE (user_id);


--
-- Name: member_activity member_activity_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_activity
    ADD CONSTRAINT member_activity_member_id_key UNIQUE (member_id);


--
-- Name: member_activity member_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_activity
    ADD CONSTRAINT member_activity_pkey PRIMARY KEY (id);


--
-- Name: members members_member_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_member_code_key UNIQUE (member_code);


--
-- Name: members members_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_phone_number_key UNIQUE (phone_number);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: navigation_config navigation_config_nav_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigation_config
    ADD CONSTRAINT navigation_config_nav_key_key UNIQUE (nav_key);


--
-- Name: navigation_config navigation_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.navigation_config
    ADD CONSTRAINT navigation_config_pkey PRIMARY KEY (id);


--
-- Name: operation_logs operation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_logs
    ADD CONSTRAINT operation_logs_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_providers payment_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_providers
    ADD CONSTRAINT payment_providers_pkey PRIMARY KEY (id);


--
-- Name: points_accounts points_accounts_member_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_accounts
    ADD CONSTRAINT points_accounts_member_code_key UNIQUE (member_code);


--
-- Name: points_accounts points_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_accounts
    ADD CONSTRAINT points_accounts_pkey PRIMARY KEY (id);


--
-- Name: points_ledger points_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_ledger
    ADD CONSTRAINT points_ledger_pkey PRIMARY KEY (id);


--
-- Name: points_summary points_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_summary
    ADD CONSTRAINT points_summary_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: referral_relations referral_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_relations
    ADD CONSTRAINT referral_relations_pkey PRIMARY KEY (id);


--
-- Name: report_titles report_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_titles
    ADD CONSTRAINT report_titles_pkey PRIMARY KEY (id);


--
-- Name: report_titles report_titles_report_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_titles
    ADD CONSTRAINT report_titles_report_key_key UNIQUE (report_key);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_module_name_field_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_module_name_field_name_key UNIQUE (role, module_name, field_name);


--
-- Name: shared_data_store shared_data_store_data_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_data_store
    ADD CONSTRAINT shared_data_store_data_key_key UNIQUE (data_key);


--
-- Name: shared_data_store shared_data_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_data_store
    ADD CONSTRAINT shared_data_store_pkey PRIMARY KEY (id);


--
-- Name: user_data_store user_data_store_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data_store
    ADD CONSTRAINT user_data_store_pkey PRIMARY KEY (id);


--
-- Name: user_data_store user_data_store_user_id_data_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data_store
    ADD CONSTRAINT user_data_store_user_id_data_key_key UNIQUE (user_id, data_key);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_records_status ON public.audit_records USING btree (status);


--
-- Name: idx_employee_name_history_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_name_history_changed_at ON public.employee_name_history USING btree (changed_at DESC);


--
-- Name: idx_employee_name_history_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_name_history_employee_id ON public.employee_name_history USING btree (employee_id);


--
-- Name: idx_employees_real_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_real_name ON public.employees USING btree (real_name);


--
-- Name: idx_members_phone_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_phone_number ON public.members USING btree (phone_number);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_orders_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_order_type ON public.orders USING btree (order_type);


--
-- Name: idx_orders_sales_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_sales_user_id ON public.orders USING btree (sales_user_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_points_ledger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_points_ledger_created_at ON public.points_ledger USING btree (created_at);


--
-- Name: idx_points_ledger_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_points_ledger_member_id ON public.points_ledger USING btree (member_id);


--
-- Name: idx_shared_data_store_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_data_store_key ON public.shared_data_store USING btree (data_key);


--
-- Name: idx_user_data_store_data_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_data_store_data_key ON public.user_data_store USING btree (data_key);


--
-- Name: idx_user_data_store_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_data_store_user_id ON public.user_data_store USING btree (user_id);


--
-- Name: employees trg_hash_employee_password_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hash_employee_password_ins BEFORE INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION public.hash_employee_password();


--
-- Name: employees trg_hash_employee_password_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hash_employee_password_upd BEFORE UPDATE OF password_hash ON public.employees FOR EACH ROW EXECUTE FUNCTION public.hash_employee_password();


--
-- Name: activity_types update_activity_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activity_types_updated_at BEFORE UPDATE ON public.activity_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: currencies update_currencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_sources update_customer_sources_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_sources_updated_at BEFORE UPDATE ON public.customer_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: member_activity update_member_activity_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_member_activity_updated_at BEFORE UPDATE ON public.member_activity FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: members update_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: role_permissions update_role_permissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_role_permissions_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shared_data_store update_shared_data_store_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_shared_data_store_updated_at BEFORE UPDATE ON public.shared_data_store FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_data_store update_user_data_store_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_data_store_updated_at BEFORE UPDATE ON public.user_data_store FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_gifts activity_gifts_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_gifts
    ADD CONSTRAINT activity_gifts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.employees(id);


--
-- Name: activity_gifts activity_gifts_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_gifts
    ADD CONSTRAINT activity_gifts_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: audit_records audit_records_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records
    ADD CONSTRAINT audit_records_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.employees(id);


--
-- Name: audit_records audit_records_submitter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_records
    ADD CONSTRAINT audit_records_submitter_id_fkey FOREIGN KEY (submitter_id) REFERENCES public.employees(id);


--
-- Name: employee_name_history employee_name_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_name_history
    ADD CONSTRAINT employee_name_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id);


--
-- Name: employee_name_history employee_name_history_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_name_history
    ADD CONSTRAINT employee_name_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_permissions employee_permissions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_permissions
    ADD CONSTRAINT employee_permissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: exchange_rate_state exchange_rate_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rate_state
    ADD CONSTRAINT exchange_rate_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: member_activity member_activity_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_activity
    ADD CONSTRAINT member_activity_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: members members_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.employees(id);


--
-- Name: members members_recorder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_recorder_id_fkey FOREIGN KEY (recorder_id) REFERENCES public.employees(id);


--
-- Name: members members_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.customer_sources(id);


--
-- Name: operation_logs operation_logs_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_logs
    ADD CONSTRAINT operation_logs_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.employees(id);


--
-- Name: operation_logs operation_logs_restored_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_logs
    ADD CONSTRAINT operation_logs_restored_by_fkey FOREIGN KEY (restored_by) REFERENCES public.employees(id);


--
-- Name: orders orders_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.employees(id);


--
-- Name: orders orders_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: orders orders_sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_sales_user_id_fkey FOREIGN KEY (sales_user_id) REFERENCES public.employees(id);


--
-- Name: points_ledger points_ledger_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_ledger
    ADD CONSTRAINT points_ledger_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.employees(id);


--
-- Name: points_ledger points_ledger_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_ledger
    ADD CONSTRAINT points_ledger_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: points_ledger points_ledger_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.points_ledger
    ADD CONSTRAINT points_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: profiles profiles_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_data_store user_data_store_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_data_store
    ADD CONSTRAINT user_data_store_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: currencies Admin/Manager can delete currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can delete currencies" ON public.currencies FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: role_permissions Admin/Manager can delete role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can delete role permissions" ON public.role_permissions FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: activity_reward_tiers Admin/Manager can manage activity rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage activity rewards" ON public.activity_reward_tiers TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: card_types Admin/Manager can manage card types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage card types" ON public.card_types USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: cards Admin/Manager can manage cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage cards" ON public.cards USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: currencies Admin/Manager can manage currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage currencies" ON public.currencies FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: customer_sources Admin/Manager can manage customer sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage customer sources" ON public.customer_sources TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: navigation_config Admin/Manager can manage navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage navigation" ON public.navigation_config TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: payment_providers Admin/Manager can manage payment providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage payment providers" ON public.payment_providers USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: employee_permissions Admin/Manager can manage permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage permissions" ON public.employee_permissions TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: report_titles Admin/Manager can manage report titles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage report titles" ON public.report_titles TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: role_permissions Admin/Manager can manage role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage role permissions" ON public.role_permissions FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: data_settings Admin/Manager can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage settings" ON public.data_settings TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: vendors Admin/Manager can manage vendors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can manage vendors" ON public.vendors USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: currencies Admin/Manager can update currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can update currencies" ON public.currencies FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: points_summary Admin/Manager can update points summary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can update points summary" ON public.points_summary FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: role_permissions Admin/Manager can update role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/Manager can update role permissions" ON public.role_permissions FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: employee_name_history Allow authenticated users to insert name history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to insert name history" ON public.employee_name_history FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: employee_name_history Allow authenticated users to view name history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to view name history" ON public.employee_name_history FOR SELECT TO authenticated USING (true);


--
-- Name: customer_sources Anyone can view customer sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view customer sources" ON public.customer_sources FOR SELECT TO authenticated USING (true);


--
-- Name: activity_reward_tiers Authenticated can view activity rewards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view activity rewards" ON public.activity_reward_tiers FOR SELECT TO authenticated USING (true);


--
-- Name: card_types Authenticated can view card types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view card types" ON public.card_types FOR SELECT USING (true);


--
-- Name: cards Authenticated can view cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view cards" ON public.cards FOR SELECT USING (true);


--
-- Name: currencies Authenticated can view currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view currencies" ON public.currencies FOR SELECT USING (true);


--
-- Name: navigation_config Authenticated can view navigation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view navigation" ON public.navigation_config FOR SELECT TO authenticated USING (true);


--
-- Name: payment_providers Authenticated can view payment providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view payment providers" ON public.payment_providers FOR SELECT USING (true);


--
-- Name: employee_permissions Authenticated can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view permissions" ON public.employee_permissions FOR SELECT TO authenticated USING (true);


--
-- Name: points_summary Authenticated can view points summary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view points summary" ON public.points_summary FOR SELECT TO authenticated USING (true);


--
-- Name: report_titles Authenticated can view report titles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view report titles" ON public.report_titles FOR SELECT TO authenticated USING (true);


--
-- Name: role_permissions Authenticated can view role permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view role permissions" ON public.role_permissions FOR SELECT USING (true);


--
-- Name: data_settings Authenticated can view settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view settings" ON public.data_settings FOR SELECT TO authenticated USING (true);


--
-- Name: vendors Authenticated can view vendors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can view vendors" ON public.vendors FOR SELECT USING (true);


--
-- Name: user_data_store Users can delete own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own data" ON public.user_data_store FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: user_data_store Users can insert own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own data" ON public.user_data_store FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((id = auth.uid()));


--
-- Name: exchange_rate_state Users can manage own exchange rate state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own exchange rate state" ON public.exchange_rate_state TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_data_store Users can update own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own data" ON public.user_data_store FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: profiles Users can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: user_data_store Users can view own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own data" ON public.user_data_store FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: activity_gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_gifts activity_gifts_employee_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_gifts_employee_delete ON public.activity_gifts FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: activity_gifts activity_gifts_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_gifts_employee_insert ON public.activity_gifts FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: activity_gifts activity_gifts_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_gifts_employee_select ON public.activity_gifts FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: activity_gifts activity_gifts_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_gifts_employee_update ON public.activity_gifts FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: activity_reward_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_reward_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_types activity_types_admin_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_types_admin_manager ON public.activity_types USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: activity_types activity_types_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_types_select ON public.activity_types FOR SELECT USING (true);


--
-- Name: audit_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_records ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_records audit_records_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_records_employee_insert ON public.audit_records FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: audit_records audit_records_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_records_employee_select ON public.audit_records FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: audit_records audit_records_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_records_employee_update ON public.audit_records FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: card_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_types ENABLE ROW LEVEL SECURITY;

--
-- Name: cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: data_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_name_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_name_history ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_admin_delete ON public.employees FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: employees employees_admin_manager_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_admin_manager_insert ON public.employees FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: employees employees_admin_manager_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_admin_manager_update ON public.employees FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: employees employees_self_or_admin_manager_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_self_or_admin_manager_select ON public.employees FOR SELECT USING (((id = ( SELECT profiles.employee_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: exchange_rate_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rate_state ENABLE ROW LEVEL SECURITY;

--
-- Name: member_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: member_activity member_activity_admin_manager_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_activity_admin_manager_delete ON public.member_activity FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: member_activity member_activity_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_activity_employee_insert ON public.member_activity FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: member_activity member_activity_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_activity_employee_select ON public.member_activity FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: member_activity member_activity_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY member_activity_employee_update ON public.member_activity FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: members members_employee_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_employee_delete ON public.members FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: members members_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_employee_insert ON public.members FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: members members_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_employee_select ON public.members FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: members members_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_employee_update ON public.members FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: navigation_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.navigation_config ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: operation_logs operation_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operation_logs_insert ON public.operation_logs FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: operation_logs operation_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operation_logs_select ON public.operation_logs FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: operation_logs operation_logs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operation_logs_update ON public.operation_logs FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_admin_manager_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_admin_manager_delete ON public.orders FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: orders orders_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_employee_insert ON public.orders FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: orders orders_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_employee_select ON public.orders FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: orders orders_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_employee_update ON public.orders FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: payment_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: points_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: points_accounts points_accounts_admin_manager_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_accounts_admin_manager_delete ON public.points_accounts FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: points_accounts points_accounts_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_accounts_employee_insert ON public.points_accounts FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_accounts points_accounts_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_accounts_employee_select ON public.points_accounts FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_accounts points_accounts_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_accounts_employee_update ON public.points_accounts FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: points_ledger points_ledger_admin_manager_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_ledger_admin_manager_delete ON public.points_ledger FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: points_ledger points_ledger_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_ledger_employee_insert ON public.points_ledger FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_ledger points_ledger_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_ledger_employee_select ON public.points_ledger FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_ledger points_ledger_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY points_ledger_employee_update ON public.points_ledger FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: points_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.points_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_relations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_relations ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_relations referral_relations_employee_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referral_relations_employee_delete ON public.referral_relations FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: referral_relations referral_relations_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referral_relations_employee_insert ON public.referral_relations FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: referral_relations referral_relations_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referral_relations_employee_select ON public.referral_relations FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: referral_relations referral_relations_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referral_relations_employee_update ON public.referral_relations FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: report_titles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_titles ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_data_store; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_data_store ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_data_store shared_data_store_employee_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_data_store_employee_delete ON public.shared_data_store FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));


--
-- Name: shared_data_store shared_data_store_employee_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_data_store_employee_insert ON public.shared_data_store FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: shared_data_store shared_data_store_employee_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_data_store_employee_select ON public.shared_data_store FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: shared_data_store shared_data_store_employee_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shared_data_store_employee_update ON public.shared_data_store FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));


--
-- Name: user_data_store; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_data_store ENABLE ROW LEVEL SECURITY;

--
-- Name: vendors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;