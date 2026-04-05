/**
 * SQL 语句生成工具
 * 用于生成 PostgreSQL 兼容的 SQL 语句
 */

// 格式化 SQL 值
export function formatSQLValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  if (value instanceof Date) {
    return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  }
  
  if (Array.isArray(value)) {
    // 如果数组包含对象，作为 JSONB 处理（如 data_value 字段）
    const hasObjects = value.some(item => item !== null && typeof item === 'object');
    if (hasObjects || value.length === 0) {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    }
    // 纯字符串/数字数组：使用 PostgreSQL 数组格式
    const formattedItems = value.map(item => {
      if (typeof item === 'string') {
        return `"${item.replace(/"/g, '\\"')}"`;
      }
      return String(item);
    });
    return `'{${formattedItems.join(',')}}'`;
  }
  
  if (typeof value === 'object') {
    // JSON 对象
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  
  // 字符串 - 转义单引号
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

// 生成单个表的 INSERT 语句
export function generateInsertSQL(tableName: string, data: any[]): string {
  if (!data || data.length === 0) {
    return `-- No data in table ${tableName}\n`;
  }
  
  const columns = Object.keys(data[0]);
  const statements: string[] = [];
  
  // 分批生成，每批 100 条
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const values = batch.map(row => 
      `(${columns.map(col => formatSQLValue(row[col])).join(', ')})`
    ).join(',\n  ');
    
    // 使用 ON CONFLICT DO NOTHING 避免重复插入导致导入失败
    statements.push(
      `INSERT INTO public.${tableName} (${columns.join(', ')}) VALUES\n  ${values}\nON CONFLICT (id) DO NOTHING;`
    );
  }
  
  return `-- Table: ${tableName} (${data.length} records)\n${statements.join('\n\n')}\n`;
}

// 生成表结构 SQL (基于已知的表定义)
export function generateCreateTableSQL(tableName: string, columns: ColumnInfo[]): string {
  const columnDefs = columns.map(col => {
    let def = `  ${col.column_name} ${col.data_type}`;
    
    if (col.column_default) {
      def += ` DEFAULT ${col.column_default}`;
    }
    
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }
    
    return def;
  });
  
  return `CREATE TABLE IF NOT EXISTS public.${tableName} (\n${columnDefs.join(',\n')}\n);\n`;
}

// 列信息接口
export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

// 硬编码的表结构定义（因为无法直接查询 information_schema）
export const TABLE_SCHEMAS: Record<string, string> = {
  employees: `CREATE TABLE IF NOT EXISTS public.employees (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  username text NOT NULL UNIQUE,
  real_name text NOT NULL,
  password_hash text NOT NULL,
  role public.app_role DEFAULT 'staff'::public.app_role NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  visible boolean DEFAULT false NOT NULL,
  is_super_admin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,
  
  members: `CREATE TABLE IF NOT EXISTS public.members (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  phone_number text NOT NULL,
  member_code text NOT NULL,
  member_level text,
  bank_card text,
  common_cards text[],
  currency_preferences text[],
  customer_feature text,
  remark text,
  source_id uuid,
  creator_id uuid,
  recorder_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  orders: `CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  order_number text NOT NULL,
  order_type text NOT NULL,
  phone_number text,
  member_id uuid,
  member_code_snapshot text,
  amount numeric DEFAULT 0 NOT NULL,
  actual_payment numeric DEFAULT 0,
  exchange_rate numeric,
  foreign_rate numeric,
  fee numeric DEFAULT 0,
  profit_ngn numeric DEFAULT 0,
  profit_usdt numeric DEFAULT 0,
  profit_rate numeric DEFAULT 0,
  card_value numeric DEFAULT 0,
  payment_value numeric DEFAULT 0,
  currency text,
  vendor_id text,
  card_merchant_id text,
  order_points integer DEFAULT 0,
  points_status text DEFAULT 'none'::text,
  status text DEFAULT 'pending'::text NOT NULL,
  remark text,
  sales_user_id uuid,
  creator_id uuid,
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone,
  data_version smallint DEFAULT 2,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  points_ledger: `CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  member_id uuid,
  member_code text,
  phone_number text,
  order_id uuid,
  actual_payment numeric,
  exchange_rate numeric,
  usd_amount numeric,
  points_multiplier numeric,
  points_earned integer DEFAULT 0 NOT NULL,
  currency text,
  transaction_type text NOT NULL,
  status text DEFAULT 'issued'::text NOT NULL,
  creator_id uuid,
  creator_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  points_accounts: `CREATE TABLE IF NOT EXISTS public.points_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  member_code text NOT NULL UNIQUE,
  phone text NOT NULL,
  current_points integer DEFAULT 0,
  points_accrual_start_time timestamp with time zone DEFAULT now() NOT NULL,
  last_reset_time timestamp with time zone,
  current_cycle_id text,
  last_updated timestamp with time zone DEFAULT now() NOT NULL
);`,

  member_activity: `CREATE TABLE IF NOT EXISTS public.member_activity (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  member_id uuid UNIQUE,
  phone_number text,
  order_count integer DEFAULT 0 NOT NULL,
  referral_count integer DEFAULT 0 NOT NULL,
  accumulated_points integer DEFAULT 0 NOT NULL,
  remaining_points integer DEFAULT 0 NOT NULL,
  referral_points integer DEFAULT 0 NOT NULL,
  total_accumulated_ngn numeric DEFAULT 0,
  total_accumulated_ghs numeric DEFAULT 0,
  total_accumulated_usdt numeric DEFAULT 0,
  total_gift_ngn numeric DEFAULT 0,
  total_gift_ghs numeric DEFAULT 0,
  total_gift_usdt numeric DEFAULT 0,
  accumulated_profit numeric DEFAULT 0,
  accumulated_profit_usdt numeric DEFAULT 0,
  last_reset_time timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  activity_gifts: `CREATE TABLE IF NOT EXISTS public.activity_gifts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  member_id uuid,
  phone_number text NOT NULL,
  currency text NOT NULL,
  amount numeric NOT NULL,
  rate numeric NOT NULL,
  fee numeric DEFAULT 0,
  gift_value numeric DEFAULT 0,
  gift_type text,
  payment_agent text NOT NULL,
  remark text,
  creator_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  referral_relations: `CREATE TABLE IF NOT EXISTS public.referral_relations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  referrer_phone text NOT NULL,
  referrer_member_code text NOT NULL,
  referee_phone text NOT NULL,
  referee_member_code text NOT NULL,
  source text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  cards: `CREATE TABLE IF NOT EXISTS public.cards (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  type text,
  status text DEFAULT 'active'::text NOT NULL,
  remark text,
  card_vendors text[],
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  vendors: `CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  remark text,
  payment_providers text[] DEFAULT '{}'::text[],
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  payment_providers: `CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  remark text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  currencies: `CREATE TABLE IF NOT EXISTS public.currencies (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  code text NOT NULL,
  name_zh text NOT NULL,
  name_en text NOT NULL,
  symbol text DEFAULT ''::text,
  badge_color text DEFAULT 'bg-gray-100 text-gray-700 border-gray-200'::text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  customer_sources: `CREATE TABLE IF NOT EXISTS public.customer_sources (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  activity_types: `CREATE TABLE IF NOT EXISTS public.activity_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  value text NOT NULL,
  label text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);`,

  activity_reward_tiers: `CREATE TABLE IF NOT EXISTS public.activity_reward_tiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  min_points integer NOT NULL,
  max_points integer,
  reward_amount_ngn numeric DEFAULT 0,
  reward_amount_ghs numeric DEFAULT 0,
  reward_amount_usdt numeric DEFAULT 0,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  operation_logs: `CREATE TABLE IF NOT EXISTS public.operation_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
  restored_at timestamp with time zone,
  timestamp timestamp with time zone DEFAULT now()
);`,

  employee_login_logs: `CREATE TABLE IF NOT EXISTS public.employee_login_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid NOT NULL,
  login_time timestamp with time zone DEFAULT now() NOT NULL,
  ip_address text,
  user_agent text,
  login_method text DEFAULT 'password'::text,
  success boolean DEFAULT true,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  audit_records: `CREATE TABLE IF NOT EXISTS public.audit_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  shift_handovers: `CREATE TABLE IF NOT EXISTS public.shift_handovers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  handover_employee_id uuid,
  handover_employee_name text NOT NULL,
  receiver_name text NOT NULL,
  handover_time timestamp with time zone DEFAULT now() NOT NULL,
  card_merchant_data jsonb DEFAULT '[]'::jsonb NOT NULL,
  payment_provider_data jsonb DEFAULT '[]'::jsonb NOT NULL,
  remark text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  balance_change_logs: `CREATE TABLE IF NOT EXISTS public.balance_change_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  merchant_type text NOT NULL,
  merchant_name text NOT NULL,
  change_type text NOT NULL,
  change_amount numeric NOT NULL,
  balance_before numeric DEFAULT 0 NOT NULL,
  balance_after numeric DEFAULT 0 NOT NULL,
  related_id text,
  remark text,
  operator_id uuid,
  operator_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  shared_data_store: `CREATE TABLE IF NOT EXISTS public.shared_data_store (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  data_key text NOT NULL,
  data_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  role_permissions: `CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  role public.app_role NOT NULL,
  module_name text NOT NULL,
  field_name text NOT NULL,
  can_view boolean DEFAULT false NOT NULL,
  can_edit boolean DEFAULT false NOT NULL,
  can_delete boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  permission_versions: `CREATE TABLE IF NOT EXISTS public.permission_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  target_role text NOT NULL,
  version_name text NOT NULL,
  version_description text,
  permissions_snapshot jsonb NOT NULL,
  is_auto_backup boolean DEFAULT false,
  created_by uuid,
  created_by_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  permission_change_logs: `CREATE TABLE IF NOT EXISTS public.permission_change_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  target_role text NOT NULL,
  action_type text NOT NULL,
  template_name text,
  changed_by uuid,
  changed_by_name text NOT NULL,
  changed_by_role text NOT NULL,
  changes_summary jsonb DEFAULT '[]'::jsonb NOT NULL,
  before_data jsonb,
  after_data jsonb,
  is_rollback boolean DEFAULT false,
  rollback_to_version_id uuid,
  ip_address text,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  knowledge_categories: `CREATE TABLE IF NOT EXISTS public.knowledge_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  content_type text DEFAULT 'text'::text NOT NULL,
  visibility text DEFAULT 'public'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  knowledge_articles: `CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  category_id uuid NOT NULL,
  title_zh text NOT NULL,
  title_en text,
  description text,
  content text,
  image_url text,
  visibility text DEFAULT 'public'::text NOT NULL,
  is_published boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  knowledge_read_status: `CREATE TABLE IF NOT EXISTS public.knowledge_read_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid NOT NULL,
  article_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  api_keys: `CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
  rate_limit integer DEFAULT 60 NOT NULL,
  ip_whitelist text[],
  status text DEFAULT 'active'::text NOT NULL,
  remark text,
  expires_at timestamp with time zone,
  last_used_at timestamp with time zone,
  total_requests bigint DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  api_rate_limits: `CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  api_key_id uuid NOT NULL,
  window_start timestamp with time zone NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  UNIQUE (api_key_id, window_start)
);`,

  api_request_logs: `CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  api_key_id uuid,
  key_prefix text,
  endpoint text NOT NULL,
  method text DEFAULT 'GET'::text NOT NULL,
  request_params jsonb,
  response_status integer NOT NULL,
  response_time_ms integer,
  error_message text,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  webhooks: `CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  secret text,
  events text[] DEFAULT '{}'::text[] NOT NULL,
  headers jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active'::text NOT NULL,
  remark text,
  retry_count integer DEFAULT 3 NOT NULL,
  timeout_ms integer DEFAULT 5000 NOT NULL,
  last_triggered_at timestamp with time zone,
  total_deliveries bigint DEFAULT 0 NOT NULL,
  successful_deliveries bigint DEFAULT 0 NOT NULL,
  failed_deliveries bigint DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  webhook_delivery_logs: `CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  webhook_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  response_time_ms integer,
  error_message text,
  attempt_count integer DEFAULT 1 NOT NULL,
  success boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  webhook_event_queue: `CREATE TABLE IF NOT EXISTS public.webhook_event_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  retry_count integer DEFAULT 0 NOT NULL,
  max_retries integer DEFAULT 3 NOT NULL,
  next_retry_at timestamp with time zone,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  profiles: `CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY,
  email text,
  employee_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  card_types: `CREATE TABLE IF NOT EXISTS public.card_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  points_summary: `CREATE TABLE IF NOT EXISTS public.points_summary (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  total_issued_points bigint DEFAULT 0 NOT NULL,
  total_reversed_points bigint DEFAULT 0 NOT NULL,
  net_points bigint DEFAULT 0 NOT NULL,
  transaction_count integer DEFAULT 0 NOT NULL,
  last_updated timestamp with time zone DEFAULT now() NOT NULL
);`,

  user_data_store: `CREATE TABLE IF NOT EXISTS public.user_data_store (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  data_key text NOT NULL,
  data_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  exchange_rate_state: `CREATE TABLE IF NOT EXISTS public.exchange_rate_state (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid,
  form_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  data_settings: `CREATE TABLE IF NOT EXISTS public.data_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  report_titles: `CREATE TABLE IF NOT EXISTS public.report_titles (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  report_key text NOT NULL,
  title_zh text NOT NULL,
  title_en text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  employee_permissions: `CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid,
  permission_key text NOT NULL,
  can_edit_directly boolean DEFAULT false NOT NULL,
  requires_approval boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  employee_name_history: `CREATE TABLE IF NOT EXISTS public.employee_name_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  employee_id uuid NOT NULL,
  old_name text NOT NULL,
  new_name text NOT NULL,
  reason text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);`,

  shift_receivers: `CREATE TABLE IF NOT EXISTS public.shift_receivers (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  creator_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);`
};

// 数据库函数定义
export const DATABASE_FUNCTIONS = `-- Database Functions
-- NOTE: pgcrypto may be exposed as extensions.crypt / extensions.gen_salt (some managed Postgres)
-- or as crypt / gen_salt in public. Adjust qualifiers to match your cluster (requires pgcrypto).

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Password hashing trigger (qualify crypt/gen_salt per your pgcrypto install)
CREATE OR REPLACE FUNCTION public.hash_employee_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_employee_login(p_username text, p_password text)
RETURNS TABLE(employee_id uuid, username text, real_name text, role app_role, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.username, e.real_name, e.role, e.status
  FROM public.employees e
  WHERE e.username = p_username
    AND e.status = 'active'
    AND (
      (e.password_hash LIKE '$2%' AND e.password_hash = crypt(p_password, e.password_hash))
      OR
      (e.password_hash NOT LIKE '$2%' AND e.password_hash = p_password)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.get_employee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT employee_id
  FROM public.profiles
  WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.calculate_member_points(p_member_code text, p_last_reset_time timestamp with time zone DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  total_points integer;
BEGIN
  IF p_last_reset_time IS NULL THEN
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status IN ('issued', 'reversed');
  ELSE
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status IN ('issued', 'reversed')
      AND created_at > p_last_reset_time;
  END IF;
  
  RETURN total_points;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_employee_login(
  p_employee_id uuid, 
  p_ip_address text DEFAULT NULL, 
  p_user_agent text DEFAULT NULL, 
  p_success boolean DEFAULT true, 
  p_failure_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.employee_login_logs (
    employee_id, ip_address, user_agent, success, failure_reason
  ) VALUES (
    p_employee_id, p_ip_address, p_user_agent, p_success, p_failure_reason
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.signup_employee(p_username text, p_password text, p_real_name text)
RETURNS TABLE(success boolean, error_code text, employee_id uuid, assigned_role app_role, assigned_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_first BOOLEAN;
  new_role app_role;
  new_status text;
  new_employee_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM employees WHERE username = p_username) THEN
    RETURN QUERY SELECT false, 'USERNAME_EXISTS'::text, NULL::uuid, NULL::app_role, NULL::text;
    RETURN;
  END IF;
  
  SELECT NOT EXISTS (SELECT 1 FROM employees LIMIT 1) INTO is_first;
  
  IF is_first THEN
    new_role := 'admin';
    new_status := 'active';
  ELSE
    new_role := 'staff';
    new_status := 'pending';
  END IF;
  
  INSERT INTO employees (username, real_name, password_hash, role, status, visible)
  VALUES (p_username, p_real_name, p_password, new_role, new_status, true)
  RETURNING id INTO new_employee_id;
  
  RETURN QUERY SELECT true, NULL::text, new_employee_id, new_role, new_status;
END;
$$;

-- Create triggers
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER hash_password_trigger BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.hash_employee_password();

CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_providers_updated_at BEFORE UPDATE ON public.payment_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
`;

// 获取所有表名列表
export function getAllTableNames(): string[] {
  return Object.keys(TABLE_SCHEMAS);
}

// 生成完整的 schema SQL
export function generateFullSchemaSQL(): string {
  const header = `-- ============================================
-- Database Schema Export
-- Generated: ${new Date().toISOString()}
-- Compatible with PostgreSQL 14+
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types (ignore if already exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

`;
  
  const tables = Object.entries(TABLE_SCHEMAS)
    .map(([name, sql]) => `-- Table: ${name}\n${sql}`)
    .join('\n\n');
  
  return header + tables + '\n';
}

// 生成导入指南
export function generateImportGuide(): string {
  return `# 数据库迁移导入指南
# Database Migration Import Guide

## 前置要求 / Prerequisites

- PostgreSQL 14 或更高版本（自建或托管实例均可）
- 有创建数据库和表的权限
- psql 或其它 SQL 客户端 / Web SQL 控制台

## 方式一：在 SQL 客户端中按序执行

1. 连接到目标数据库（已启用 pgcrypto / uuid-ossp 等扩展，见 01_schema.sql）
2. 依次执行以下文件内容：

\`\`\`
1) 01_schema.sql  — 创建表结构
2) 02_functions.sql — 创建数据库函数和触发器
   ⚠️ 注意：若 pgcrypto 安装在 extensions schema，请将 crypt()/gen_salt() 写为 extensions.crypt()/extensions.gen_salt()
3) 05_data.sql    — 导入数据（使用 ON CONFLICT DO NOTHING 防止重复）
4) 04_indexes.sql — 创建索引（可选，提升查询性能）
5) 03_policies.sql — 配置 RLS 策略（若使用行级安全）
\`\`\`

### 验证数据
\`\`\`sql
SELECT 'employees' as table_name, count(*) FROM employees
UNION ALL SELECT 'members', count(*) FROM members
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'points_ledger', count(*) FROM points_ledger;
\`\`\`

## 方式二：使用 psql 命令行批量导入

### 步骤 1：创建数据库
\`\`\`bash
createdb your_app_db
psql -d your_app_db -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
\`\`\`

### 步骤 2：按顺序导入
\`\`\`bash
psql -d your_app_db -f 01_schema.sql
psql -d your_app_db -f 02_functions.sql
psql -d your_app_db -f 05_data.sql
psql -d your_app_db -f 04_indexes.sql
\`\`\`

## 方式三：从 JSON 文件导入

data/ 目录下包含每张表的 JSON 数据文件。您可以使用任何编程语言
读取 JSON 文件并通过 API 或直接 SQL 插入数据。

## 常见问题 / Troubleshooting

### ❌ 错误: type "app_role" already exists
这是正常的，脚本使用 DO $$ BEGIN...EXCEPTION 语句自动处理此情况。

### ❌ 错误: duplicate key value violates unique constraint
数据已存在，INSERT 语句使用 ON CONFLICT DO NOTHING 自动跳过重复记录。

### ❌ 错误: function crypt/gen_salt does not exist
请确保已安装 pgcrypto 扩展：
\`\`\`sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\`\`\`
若集群将 pgcrypto 装在 extensions schema，请使用 extensions.crypt() / extensions.gen_salt()。

### ❌ 外键约束错误
请严格按照文件编号顺序导入（01 → 02 → 05），数据文件中的表已按依赖顺序排列。

## 校验报告 / Verification

导出包含 VERIFICATION_REPORT.json 文件，记录了每张表的行数和关键金额校验和。
导入完成后，请对比该文件中的数据确保导入完整性。
`;
}
