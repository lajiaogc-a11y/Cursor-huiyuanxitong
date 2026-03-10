
-- Fix recompute_account_balance to SUM all active initial_balance entries
-- instead of taking only the latest one's amount (which was a delta, not full balance)
CREATE OR REPLACE FUNCTION public.recompute_account_balance(p_account_type text, p_account_id text)
 RETURNS TABLE(computed_balance numeric, transaction_count bigint, initial_balance numeric, active_sum numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_initial NUMERIC := 0;
  v_sum NUMERIC := 0;
  v_count BIGINT := 0;
BEGIN
  -- SUM all active initial_balance entries (handles both full amounts and deltas)
  SELECT COALESCE(SUM(lt.amount), 0)
  INTO v_initial
  FROM ledger_transactions lt
  WHERE lt.account_type = p_account_type
    AND lt.account_id = p_account_id
    AND lt.source_type = 'initial_balance'
    AND lt.is_active = true;

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
$function$;
