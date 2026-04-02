
-- ============================================
-- Phase 1: Ledger Transactions Table
-- Event-sourcing ledger for merchant balances
-- ============================================

-- 1. Create the ledger_transactions table
CREATE TABLE public.ledger_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,        -- merchant name (card vendor or payment provider)
  account_type TEXT NOT NULL,      -- 'card_vendor' | 'payment_provider'
  source_type TEXT NOT NULL,       -- 'order' | 'withdrawal' | 'recharge' | 'gift' | 'initial_balance' | 'initial_balance_adjustment' | 'order_adjustment' | 'gift_adjustment' | 'withdrawal_adjustment' | 'recharge_adjustment' | 'reversal' | 'op_log_restore' | 'reconciliation'
  source_id TEXT,                  -- reference to the source entity (order_id, withdrawal_id, etc.)
  amount NUMERIC NOT NULL DEFAULT 0, -- signed amount (positive = balance increase, negative = decrease)
  before_balance NUMERIC NOT NULL DEFAULT 0,
  after_balance NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- soft-delete flag
  reversal_of UUID REFERENCES public.ledger_transactions(id), -- links to the transaction being reversed
  note TEXT,
  operator_id UUID,
  operator_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for performance
CREATE INDEX idx_ledger_account ON public.ledger_transactions(account_type, account_id);
CREATE INDEX idx_ledger_source ON public.ledger_transactions(source_type, source_id);
CREATE INDEX idx_ledger_active ON public.ledger_transactions(account_type, account_id, is_active);
CREATE INDEX idx_ledger_created_at ON public.ledger_transactions(created_at DESC);
CREATE INDEX idx_ledger_reversal ON public.ledger_transactions(reversal_of) WHERE reversal_of IS NOT NULL;

-- 3. Unique constraint to prevent duplicate ledger entries for the same source
-- (source_type + source_id + account combination should be unique for active entries)
-- We use a partial unique index on active entries only
CREATE UNIQUE INDEX idx_ledger_unique_active_source 
  ON public.ledger_transactions(account_type, account_id, source_type, source_id) 
  WHERE is_active = true AND reversal_of IS NULL AND source_id IS NOT NULL;

-- 4. Enable RLS
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (same pattern as balance_change_logs)
CREATE POLICY "ledger_transactions_employee_select"
  ON public.ledger_transactions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "ledger_transactions_employee_insert"
  ON public.ledger_transactions FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "ledger_transactions_employee_update"
  ON public.ledger_transactions FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

CREATE POLICY "ledger_transactions_admin_delete"
  ON public.ledger_transactions FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Migrate existing balance_change_logs data into ledger_transactions
INSERT INTO public.ledger_transactions (
  account_id,
  account_type,
  source_type,
  source_id,
  amount,
  before_balance,
  after_balance,
  is_active,
  reversal_of,
  note,
  operator_id,
  operator_name,
  created_at
)
SELECT
  merchant_name AS account_id,
  CASE merchant_type
    WHEN 'card_vendor' THEN 'card_vendor'
    WHEN 'payment_provider' THEN 'payment_provider'
    ELSE merchant_type
  END AS account_type,
  -- Map change_type to source_type
  CASE change_type
    WHEN 'initial_balance' THEN 'initial_balance'
    WHEN 'order_income' THEN 'order'
    WHEN 'order_expense' THEN 'order'
    WHEN 'order_adjustment' THEN 'order_adjustment'
    WHEN 'order_restore' THEN 'op_log_restore'
    WHEN 'gift_expense' THEN 'gift'
    WHEN 'gift_income' THEN 'gift'
    WHEN 'gift_recovery' THEN 'reversal'
    WHEN 'gift_adjustment' THEN 'gift_adjustment'
    WHEN 'gift_restore' THEN 'op_log_restore'
    WHEN 'withdrawal' THEN 'withdrawal'
    WHEN 'withdrawal_edit' THEN 'withdrawal_adjustment'
    WHEN 'withdrawal_delete' THEN 'reversal'
    WHEN 'withdrawal_restore' THEN 'op_log_restore'
    WHEN 'recharge' THEN 'recharge'
    WHEN 'recharge_edit' THEN 'recharge_adjustment'
    WHEN 'recharge_delete' THEN 'reversal'
    WHEN 'recharge_restore' THEN 'op_log_restore'
    WHEN 'undo' THEN 'reversal'
    ELSE change_type
  END AS source_type,
  related_id AS source_id,
  change_amount AS amount,
  balance_before AS before_balance,
  balance_after AS after_balance,
  true AS is_active,  -- all existing records are active
  NULL AS reversal_of,
  COALESCE(remark, change_type) AS note,
  operator_id::uuid,
  operator_name,
  created_at
FROM public.balance_change_logs
ON CONFLICT DO NOTHING;

-- 7. DB function: Recompute account balance from ledger (for reconciliation)
CREATE OR REPLACE FUNCTION public.recompute_account_balance(
  p_account_type TEXT,
  p_account_id TEXT
)
RETURNS TABLE(
  computed_balance NUMERIC,
  transaction_count BIGINT,
  initial_balance NUMERIC,
  active_sum NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_initial NUMERIC := 0;
  v_sum NUMERIC := 0;
  v_count BIGINT := 0;
BEGIN
  -- Get the latest initial_balance entry
  SELECT COALESCE(lt.amount, 0)
  INTO v_initial
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.source_type = 'initial_balance'
    AND lt.is_active = true
  ORDER BY lt.created_at DESC
  LIMIT 1;

  -- Sum all active non-initial-balance transactions
  SELECT COALESCE(SUM(lt.amount), 0), COUNT(*)
  INTO v_sum, v_count
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.is_active = true
    AND lt.source_type != 'initial_balance';

  RETURN QUERY SELECT 
    (v_initial + v_sum) AS computed_balance,
    v_count AS transaction_count,
    v_initial AS initial_balance,
    v_sum AS active_sum;
END;
$$;

-- 8. DB function: Atomic ledger entry creation with balance chain
CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_account_type TEXT,
  p_account_id TEXT,
  p_source_type TEXT,
  p_source_id TEXT,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL,
  p_operator_name TEXT DEFAULT NULL,
  p_reversal_of UUID DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  -- Get current balance (last entry's after_balance)
  SELECT COALESCE(lt.after_balance, 0)
  INTO v_before
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.is_active = true
  ORDER BY lt.created_at DESC
  LIMIT 1;

  IF v_before IS NULL THEN
    v_before := 0;
  END IF;

  v_after := v_before + p_amount;

  INSERT INTO ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance,
    is_active, reversal_of, note,
    operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, p_source_type, p_source_id,
    p_amount, v_before, v_after,
    true, p_reversal_of, p_note,
    p_operator_id, p_operator_name
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- 9. DB function: Soft-delete a ledger entry and create reversal
CREATE OR REPLACE FUNCTION public.soft_delete_ledger_entry(
  p_source_type TEXT,
  p_source_id TEXT,
  p_account_type TEXT,
  p_account_id TEXT,
  p_note TEXT DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL,
  p_operator_name TEXT DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_original public.ledger_transactions;
  v_reversal public.ledger_transactions;
BEGIN
  -- Find the active entry for this source
  SELECT * INTO v_original
  FROM ledger_transactions
  WHERE source_type = p_source_type
    AND source_id = p_source_id
    AND account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND reversal_of IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Mark original as inactive
  UPDATE ledger_transactions SET is_active = false WHERE id = v_original.id;

  -- Create reversal entry
  SELECT * INTO v_reversal
  FROM public.create_ledger_entry(
    p_account_type, p_account_id,
    'reversal', p_source_id,
    -v_original.amount,
    COALESCE(p_note, '撤销: ' || v_original.note),
    p_operator_id, p_operator_name,
    v_original.id
  );

  RETURN v_reversal;
END;
$$;
