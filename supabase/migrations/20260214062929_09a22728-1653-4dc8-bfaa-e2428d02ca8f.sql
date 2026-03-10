
CREATE OR REPLACE FUNCTION public.reverse_all_entries_for_order(
  p_account_type text,
  p_account_id text,
  p_order_id text,
  p_source_prefix text,
  p_adj_prefix text,
  p_note text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_amount NUMERIC := 0;
  v_count INTEGER := 0;
  v_current_balance NUMERIC := 0;
  v_reversal public.ledger_transactions;
  v_exact_source_id text;
  v_adj_pattern text;
  v_restore_prefix text;
  v_restore_pattern text;
BEGIN
  v_exact_source_id := p_source_prefix || p_order_id;
  v_adj_pattern := p_adj_prefix || p_order_id || '_%';
  
  -- Derive restore prefix from source prefix: order_v_ -> restore_v_, order_p_ -> restore_p_
  -- Also handle gift_ -> grestore_, etc.
  IF p_source_prefix = 'order_v_' THEN
    v_restore_prefix := 'restore_v_';
  ELSIF p_source_prefix = 'order_p_' THEN
    v_restore_prefix := 'restore_p_';
  ELSIF p_source_prefix = 'gift_' THEN
    v_restore_prefix := 'grestore_';
  ELSE
    v_restore_prefix := NULL;
  END IF;
  
  v_restore_pattern := CASE WHEN v_restore_prefix IS NOT NULL 
    THEN v_restore_prefix || p_order_id || '_%' 
    ELSE NULL 
  END;

  -- Sum ALL active entries: original + adjustments + restores
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_amount, v_count
  FROM ledger_transactions
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (
      source_id = v_exact_source_id 
      OR source_id LIKE v_adj_pattern
      OR (v_restore_pattern IS NOT NULL AND source_id LIKE v_restore_pattern)
    );

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

  -- Deactivate ALL matched entries (original + adjustments + restores)
  UPDATE ledger_transactions
  SET is_active = false
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (
      source_id = v_exact_source_id 
      OR source_id LIKE v_adj_pattern
      OR (v_restore_pattern IS NOT NULL AND source_id LIKE v_restore_pattern)
    );

  -- Insert reversal with correct before_balance
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
