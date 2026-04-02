
CREATE OR REPLACE FUNCTION public.set_initial_balance_entry(p_account_type text, p_account_id text, p_new_balance numeric, p_note text DEFAULT NULL::text, p_operator_id uuid DEFAULT NULL::uuid, p_operator_name text DEFAULT NULL::text)
 RETURNS ledger_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC := 0;
  v_amount NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  -- FIX: Read current balance BEFORE deactivating old entries
  SELECT COALESCE(lt.after_balance, 0) INTO v_before
  FROM public.ledger_transactions lt
  WHERE lt.account_type = p_account_type AND lt.account_id = p_account_id AND lt.is_active = true
  ORDER BY lt.created_at DESC LIMIT 1;

  IF v_before IS NULL THEN v_before := 0; END IF;

  -- Now deactivate old initial_balance entries
  UPDATE public.ledger_transactions SET is_active = false
  WHERE account_type = p_account_type AND account_id = p_account_id
    AND source_type = 'initial_balance' AND is_active = true;

  v_amount := p_new_balance - v_before;

  INSERT INTO public.ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance, is_active, reversal_of, note, operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'initial_balance', 'ib_' || extract(epoch from now())::bigint,
    v_amount, v_before, p_new_balance, true, NULL, p_note, p_operator_id, p_operator_name
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$;
