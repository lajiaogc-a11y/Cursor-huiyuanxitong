
-- Must drop existing functions first to change return type
DROP FUNCTION IF EXISTS public.reverse_all_entries_for_order(text, text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.soft_delete_ledger_entry(text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.create_ledger_entry(text, text, text, text, numeric, text, uuid, text, uuid);

-- Recreate reverse_all_entries_for_order with fixed balance logic
CREATE OR REPLACE FUNCTION public.reverse_all_entries_for_order(
  p_account_type text,
  p_account_id text,
  p_order_id text,
  p_source_prefix text,
  p_adj_prefix text,
  p_note text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL
) RETURNS ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_amount, v_count
  FROM ledger_transactions
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_source_id_pattern);

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

  UPDATE ledger_transactions
  SET is_active = false
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_source_id_pattern);

  -- Insert reversal with correct before_balance (captured before deactivation)
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
$function$;

-- Recreate soft_delete_ledger_entry with fixed balance logic
CREATE OR REPLACE FUNCTION public.soft_delete_ledger_entry(
  p_source_type text,
  p_source_id text,
  p_account_type text,
  p_account_id text,
  p_note text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL
) RETURNS ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original public.ledger_transactions;
  v_current_balance NUMERIC := 0;
  v_reversal public.ledger_transactions;
BEGIN
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

  UPDATE ledger_transactions SET is_active = false WHERE id = v_original.id;

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
$function$;

-- Recreate create_ledger_entry (same logic, just ensuring consistency)
CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_account_type text,
  p_account_id text,
  p_source_type text,
  p_source_id text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_reversal_of uuid DEFAULT NULL
) RETURNS ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
  v_result public.ledger_transactions;
BEGIN
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
$function$;
