-- Fix: fully qualify return type to avoid "type does not exist" error
CREATE OR REPLACE FUNCTION public.set_initial_balance_entry(
  p_account_type text,
  p_account_id text,
  p_new_balance numeric,
  p_note text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before NUMERIC := 0;
  v_amount NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  -- Step 1: Deactivate ALL old initial_balance entries for this account
  UPDATE ledger_transactions
  SET is_active = false
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND source_type = 'initial_balance'
    AND is_active = true;

  -- Step 2: Get current balance from last active entry
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

  -- Step 3: amount = newBalance - before_balance (so after_balance = newBalance)
  v_amount := p_new_balance - v_before;

  -- Step 4: Insert new initial_balance entry
  INSERT INTO ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance,
    is_active, reversal_of, note,
    operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'initial_balance', 'ib_' || extract(epoch from now())::bigint,
    v_amount, v_before, p_new_balance,
    true, NULL, p_note,
    p_operator_id, p_operator_name
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;