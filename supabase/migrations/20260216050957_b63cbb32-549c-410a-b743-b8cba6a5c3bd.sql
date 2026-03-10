
-- Fix: Ensure ledger_transactions table exists and all functions use fully qualified return types
-- This resolves the "type ledger_transactions does not exist" build error

-- Step 1: Ensure the table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type text NOT NULL,
  account_id text NOT NULL,
  source_type text NOT NULL,
  source_id text,
  amount numeric NOT NULL DEFAULT 0,
  before_balance numeric NOT NULL DEFAULT 0,
  after_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  reversal_of uuid REFERENCES public.ledger_transactions(id),
  note text,
  operator_id uuid,
  operator_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop functions with unqualified return types to force re-creation
DROP FUNCTION IF EXISTS public.reverse_all_entries_for_order(text, text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.soft_delete_ledger_entry(text, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.create_ledger_entry(text, text, text, text, numeric, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.set_initial_balance_entry(text, text, numeric, text, uuid, text);

-- Step 3: Recreate all functions with fully qualified public.ledger_transactions return types

CREATE OR REPLACE FUNCTION public.set_initial_balance_entry(
  p_account_type text, p_account_id text, p_new_balance numeric,
  p_note text DEFAULT NULL, p_operator_id uuid DEFAULT NULL, p_operator_name text DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC := 0;
  v_amount NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  UPDATE public.ledger_transactions SET is_active = false
  WHERE account_type = p_account_type AND account_id = p_account_id
    AND source_type = 'initial_balance' AND is_active = true;

  SELECT COALESCE(lt.after_balance, 0) INTO v_before
  FROM public.ledger_transactions lt
  WHERE lt.account_type = p_account_type AND lt.account_id = p_account_id AND lt.is_active = true
  ORDER BY lt.created_at DESC LIMIT 1;

  IF v_before IS NULL THEN v_before := 0; END IF;
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

CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  p_account_type text, p_account_id text, p_source_type text, p_source_id text,
  p_amount numeric, p_note text DEFAULT NULL, p_operator_id uuid DEFAULT NULL,
  p_operator_name text DEFAULT NULL, p_reversal_of uuid DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
  v_result public.ledger_transactions;
BEGIN
  SELECT COALESCE(lt.after_balance, 0) INTO v_before
  FROM public.ledger_transactions lt
  WHERE lt.account_type = p_account_type AND lt.account_id = p_account_id AND lt.is_active = true
  ORDER BY lt.created_at DESC LIMIT 1;

  IF v_before IS NULL THEN v_before := 0; END IF;
  v_after := v_before + p_amount;

  INSERT INTO public.ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance, is_active, reversal_of, note, operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, p_source_type, p_source_id,
    p_amount, v_before, v_after, true, p_reversal_of, p_note, p_operator_id, p_operator_name
  ) RETURNING * INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_ledger_entry(
  p_source_type text, p_source_id text, p_account_type text, p_account_id text,
  p_note text DEFAULT NULL, p_operator_id uuid DEFAULT NULL, p_operator_name text DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_original public.ledger_transactions;
  v_current_balance NUMERIC := 0;
  v_reversal public.ledger_transactions;
BEGIN
  SELECT * INTO v_original FROM public.ledger_transactions
  WHERE source_type = p_source_type AND source_id = p_source_id
    AND account_type = p_account_type AND account_id = p_account_id
    AND is_active = true AND reversal_of IS NULL
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(lt.after_balance, 0) INTO v_current_balance
  FROM public.ledger_transactions lt
  WHERE lt.account_type = p_account_type AND lt.account_id = p_account_id AND lt.is_active = true
  ORDER BY lt.created_at DESC LIMIT 1;

  UPDATE public.ledger_transactions SET is_active = false WHERE id = v_original.id;

  INSERT INTO public.ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance, is_active, reversal_of, note, operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'reversal', p_source_id,
    -v_original.amount, v_current_balance, v_current_balance + (-v_original.amount),
    true, v_original.id, COALESCE(p_note, '撤销: ' || v_original.note), p_operator_id, p_operator_name
  ) RETURNING * INTO v_reversal;
  RETURN v_reversal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_all_entries_for_order(
  p_account_type text, p_account_id text, p_order_id text,
  p_source_prefix text, p_adj_prefix text,
  p_note text DEFAULT NULL, p_operator_id uuid DEFAULT NULL, p_operator_name text DEFAULT NULL
)
RETURNS public.ledger_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  
  IF p_source_prefix = 'order_v_' THEN v_restore_prefix := 'restore_v_';
  ELSIF p_source_prefix = 'order_p_' THEN v_restore_prefix := 'restore_p_';
  ELSIF p_source_prefix = 'gift_' THEN v_restore_prefix := 'grestore_';
  ELSE v_restore_prefix := NULL;
  END IF;
  
  v_restore_pattern := CASE WHEN v_restore_prefix IS NOT NULL 
    THEN v_restore_prefix || p_order_id || '_%' ELSE NULL END;

  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_total_amount, v_count
  FROM public.ledger_transactions
  WHERE account_type = p_account_type AND account_id = p_account_id AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_adj_pattern
      OR (v_restore_pattern IS NOT NULL AND source_id LIKE v_restore_pattern));

  IF v_count = 0 OR v_total_amount = 0 THEN RETURN NULL; END IF;

  SELECT COALESCE(lt.after_balance, 0) INTO v_current_balance
  FROM public.ledger_transactions lt
  WHERE lt.account_type = p_account_type AND lt.account_id = p_account_id AND lt.is_active = true
  ORDER BY lt.created_at DESC LIMIT 1;

  IF v_current_balance IS NULL THEN v_current_balance := 0; END IF;

  UPDATE public.ledger_transactions SET is_active = false
  WHERE account_type = p_account_type AND account_id = p_account_id AND is_active = true
    AND (source_id = v_exact_source_id OR source_id LIKE v_adj_pattern
      OR (v_restore_pattern IS NOT NULL AND source_id LIKE v_restore_pattern));

  INSERT INTO public.ledger_transactions (
    account_type, account_id, source_type, source_id,
    amount, before_balance, after_balance, is_active, reversal_of, note, operator_id, operator_name
  ) VALUES (
    p_account_type, p_account_id, 'reversal', 'rev_' || p_source_prefix || p_order_id,
    -v_total_amount, v_current_balance, v_current_balance + (-v_total_amount),
    true, NULL, COALESCE(p_note, '撤销合计: ' || v_count || '笔, 总额: ' || v_total_amount),
    p_operator_id, p_operator_name
  ) RETURNING * INTO v_reversal;
  RETURN v_reversal;
END;
$function$;
