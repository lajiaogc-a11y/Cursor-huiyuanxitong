
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
AS $$
DECLARE
  v_total_amount NUMERIC := 0;
  v_count INTEGER := 0;
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

  -- Mark all matching entries as inactive
  UPDATE ledger_transactions
  SET is_active = false
  WHERE account_type = p_account_type
    AND account_id = p_account_id
    AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_source_id_pattern);

  -- Create one reversal entry for the total
  SELECT * INTO v_reversal
  FROM public.create_ledger_entry(
    p_account_type,
    p_account_id,
    'reversal',
    'rev_' || p_source_prefix || p_order_id,
    -v_total_amount,
    COALESCE(p_note, '撤销合计: ' || v_count || '笔, 总额: ' || v_total_amount),
    p_operator_id,
    p_operator_name,
    NULL
  );

  RETURN v_reversal;
END;
$$;
