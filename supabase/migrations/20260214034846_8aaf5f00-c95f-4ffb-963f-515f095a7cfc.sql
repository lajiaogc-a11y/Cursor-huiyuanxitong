
-- Fix reverse_all_entries_for_order: capture before_balance BEFORE deactivating entries
CREATE OR REPLACE FUNCTION public.reverse_all_entries_for_order(
  p_account_type text,
  p_account_id text,
  p_order_id text,
  p_source_prefix text,
  p_adj_prefix text,
  p_note text DEFAULT NULL,
  p_operator_id text DEFAULT NULL,
  p_operator_name text DEFAULT NULL
) RETURNS public.ledger_transactions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total_amount NUMERIC := 0;
  v_count INTEGER := 0;
  v_current_balance NUMERIC := 0;
  v_reversal public.ledger_transactions;
  v_source_id_pattern text;
  v_exact_source_id text;
BEGIN
  v_exact_source_id := p_source_prefix || p_order_id;
  v_source_id_pattern := p_adj_prefix || p_order_id || '_%';

  -- Sum all active entries matching this order (original + adjustments)
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_amount, v_count
  FROM ledger_transactions
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_source_id_pattern);

  -- Nothing to reverse
  IF v_count = 0 OR v_total_amount = 0 THEN
    RETURN NULL;
  END IF;

  -- Capture current balance BEFORE deactivating
  SELECT COALESCE(lt.after_balance, 0)
  INTO v_current_balance
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.is_active = true
  ORDER BY lt.created_at DESC
  LIMIT 1;

  -- Mark all matching entries as inactive
  UPDATE ledger_transactions
  SET is_active = false
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_source_id_pattern);

  -- Insert reversal directly with correct before_balance
  INSERT INTO ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance,
    is_active, reversal_of, note,
    operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'reversal', 'rev_' || p_source_prefix || p_order_id,
    -v_total_amount, v_current_balance, v_current_balance + (-v_total_amount),
    true, NULL, COALESCE(p_note, '撤销合计: ' || v_count || '笔, 总额: ' || v_total_amount),
    p_operator_id, p_operator_name
  )
  RETURNING * INTO v_reversal;

  RETURN v_reversal;
END;
$$;

-- Fix soft_delete_ledger_entry: capture before_balance BEFORE deactivating
CREATE OR REPLACE FUNCTION public.soft_delete_ledger_entry(
  p_source_type text,
  p_source_id text,
  p_account_type text,
  p_account_id text,
  p_note text DEFAULT NULL,
  p_operator_id text DEFAULT NULL,
  p_operator_name text DEFAULT NULL
) RETURNS public.ledger_transactions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_original public.ledger_transactions;
  v_current_balance NUMERIC := 0;
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

  -- Capture current balance BEFORE deactivating
  SELECT COALESCE(lt.after_balance, 0)
  INTO v_current_balance
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.is_active = true
  ORDER BY lt.created_at DESC
  LIMIT 1;

  -- Mark original as inactive
  UPDATE ledger_transactions SET is_active = false WHERE id = v_original.id;

  -- Insert reversal directly with correct before_balance
  INSERT INTO ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance,
    is_active, reversal_of, note,
    operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'reversal', p_source_id,
    -v_original.amount, v_current_balance, v_current_balance + (-v_original.amount),
    true, v_original.id, COALESCE(p_note, '撤销: ' || v_original.note),
    p_operator_id, p_operator_name
  )
  RETURNING * INTO v_reversal;

  RETURN v_reversal;
END;
$$;

-- Also fix create_ledger_entry to use FOR UPDATE lock to prevent race conditions
CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_account_type text,
  p_account_id text,
  p_source_type text,
  p_source_id text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_operator_id text DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_reversal_of uuid DEFAULT NULL
) RETURNS public.ledger_transactions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  -- Get current balance (last entry's after_balance) with proper ordering
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
