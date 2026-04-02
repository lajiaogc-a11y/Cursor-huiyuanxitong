-- Fix rpc_extract_phones "column reference id is ambiguous"
-- In RETURNS TABLE(id, normalized), output args are PL/pgSQL variables.
-- Qualify column names in UPDATE/SELECT to avoid ambiguity.

CREATE OR REPLACE FUNCTION public.rpc_extract_phones(p_tenant_id uuid, p_limit_count integer)
RETURNS TABLE(id bigint, normalized text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_limit INT;
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_limit_count <= 0 THEN
    RETURN;
  END IF;

  v_limit := LEAST(p_limit_count, (SELECT per_extract_limit FROM public.phone_extract_settings WHERE public.phone_extract_settings.id = 1));

  IF (
    SELECT COALESCE(COUNT(*), 0)
    FROM public.phone_reservations pr
    WHERE pr.user_id = v_user
      AND pr.action = 'extract'
      AND pr.action_at::date = now()::date
  ) >= (
    SELECT per_user_daily_limit FROM public.phone_extract_settings s WHERE s.id = 1
  ) THEN
    RAISE EXCEPTION 'daily_limit_exceeded';
  END IF;

  FOR rec IN
    SELECT pp.id, pp.normalized
    FROM public.phone_pool pp
    WHERE pp.tenant_id = p_tenant_id
      AND pp.status = 'available'
    ORDER BY pp.id
    FOR UPDATE OF pp SKIP LOCKED
    LIMIT v_limit
  LOOP
    UPDATE public.phone_pool p
    SET status = 'reserved', reserved_by = v_user, reserved_at = now()
    WHERE p.id = rec.id;

    INSERT INTO public.phone_reservations (phone_pool_id, user_id, action)
    VALUES (rec.id, v_user, 'extract');

    RETURN QUERY SELECT rec.id, rec.normalized;
  END LOOP;
END;
$function$;

