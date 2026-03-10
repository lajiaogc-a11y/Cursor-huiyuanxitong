DROP FUNCTION IF EXISTS public.create_ledger_entry(text, text, text, text, numeric, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.soft_delete_ledger_entry(text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.reverse_all_entries_for_order(text, text, text, text, text, text, text, text);