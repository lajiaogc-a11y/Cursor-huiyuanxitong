
-- ============= 冷热数据归档系统 =============

-- 1. 订单归档表
CREATE TABLE IF NOT EXISTS public.archived_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  order_number text NOT NULL,
  order_type text NOT NULL,
  phone_number text,
  currency text,
  amount numeric NOT NULL DEFAULT 0,
  actual_payment numeric,
  exchange_rate numeric,
  fee numeric,
  profit_ngn numeric,
  profit_usdt numeric,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  original_data jsonb NOT NULL
);

CREATE INDEX idx_archived_orders_created_at ON public.archived_orders(created_at);
CREATE INDEX idx_archived_orders_original_id ON public.archived_orders(original_id);

-- 2. 操作日志归档表
CREATE TABLE IF NOT EXISTS public.archived_operation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  module text NOT NULL,
  operation_type text NOT NULL,
  operator_account text NOT NULL,
  operator_role text NOT NULL,
  timestamp timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  original_data jsonb NOT NULL
);

CREATE INDEX idx_archived_op_logs_timestamp ON public.archived_operation_logs(timestamp);

-- 3. 积分流水归档表
CREATE TABLE IF NOT EXISTS public.archived_points_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  phone_number text,
  member_code text,
  points_earned integer NOT NULL,
  transaction_type text NOT NULL,
  created_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  original_data jsonb NOT NULL
);

CREATE INDEX idx_archived_points_created_at ON public.archived_points_ledger(created_at);

-- 4. 归档执行记录表
CREATE TABLE IF NOT EXISTS public.archive_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  tables_processed text[] NOT NULL DEFAULT '{}',
  records_archived jsonb NOT NULL DEFAULT '{}',
  records_deleted jsonb NOT NULL DEFAULT '{}',
  duration_ms integer,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  triggered_by text NOT NULL DEFAULT 'manual'
);

-- 5. 归档函数 - 将超过指定天数的数据移入归档表
CREATE OR REPLACE FUNCTION public.archive_old_data(retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date timestamptz;
  orders_count integer := 0;
  logs_count integer := 0;
  points_count integer := 0;
  result jsonb;
BEGIN
  cutoff_date := now() - (retention_days || ' days')::interval;

  -- Archive completed/deleted orders
  WITH moved AS (
    INSERT INTO public.archived_orders (original_id, order_number, order_type, phone_number, currency, amount, actual_payment, exchange_rate, fee, profit_ngn, profit_usdt, status, created_at, completed_at, original_data)
    SELECT id, order_number, order_type, phone_number, currency, amount, actual_payment, exchange_rate, fee, profit_ngn, profit_usdt, status, created_at, completed_at, row_to_json(o)::jsonb
    FROM public.orders o
    WHERE created_at < cutoff_date AND (status IN ('completed', 'cancelled') OR is_deleted = true)
    RETURNING original_id
  )
  SELECT count(*) INTO orders_count FROM moved;

  -- Delete archived orders from hot table
  IF orders_count > 0 THEN
    DELETE FROM public.orders
    WHERE created_at < cutoff_date AND (status IN ('completed', 'cancelled') OR is_deleted = true);
  END IF;

  -- Archive operation logs
  WITH moved AS (
    INSERT INTO public.archived_operation_logs (original_id, module, operation_type, operator_account, operator_role, timestamp, original_data)
    SELECT id, module, operation_type, operator_account, operator_role, timestamp, row_to_json(o)::jsonb
    FROM public.operation_logs o
    WHERE timestamp < cutoff_date
    RETURNING original_id
  )
  SELECT count(*) INTO logs_count FROM moved;

  IF logs_count > 0 THEN
    DELETE FROM public.operation_logs WHERE timestamp < cutoff_date;
  END IF;

  -- Archive points ledger
  WITH moved AS (
    INSERT INTO public.archived_points_ledger (original_id, phone_number, member_code, points_earned, transaction_type, created_at, original_data)
    SELECT id, phone_number, member_code, points_earned, transaction_type, created_at, row_to_json(p)::jsonb
    FROM public.points_ledger p
    WHERE created_at < cutoff_date
    RETURNING original_id
  )
  SELECT count(*) INTO points_count FROM moved;

  IF points_count > 0 THEN
    DELETE FROM public.points_ledger WHERE created_at < cutoff_date;
  END IF;

  -- Log the run
  result := jsonb_build_object(
    'orders_archived', orders_count,
    'operation_logs_archived', logs_count,
    'points_ledger_archived', points_count,
    'cutoff_date', cutoff_date
  );

  INSERT INTO public.archive_runs (tables_processed, records_archived, triggered_by)
  VALUES (
    ARRAY['orders', 'operation_logs', 'points_ledger'],
    result,
    'function'
  );

  RETURN result;
END;
$$;

-- 6. RLS policies for archive tables (admin only)
ALTER TABLE public.archived_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archived_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_archived_orders" ON public.archived_orders FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_select_archived_op_logs" ON public.archived_operation_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_select_archived_points" ON public.archived_points_ledger FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_select_archive_runs" ON public.archive_runs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_insert_archive_runs" ON public.archive_runs FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
