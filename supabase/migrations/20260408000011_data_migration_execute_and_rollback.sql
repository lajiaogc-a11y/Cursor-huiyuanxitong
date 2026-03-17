-- Data migration tools (second batch)
-- 1) execute migration (members, strategy: SKIP/OVERWRITE)
-- 2) conflict detail
-- 3) rollback records + rollback action

CREATE TABLE IF NOT EXISTS public.tenant_migration_rollbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.tenant_migration_jobs(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_key text NOT NULL,
  action text NOT NULL,
  before_data jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_migration_rollbacks_job_id
  ON public.tenant_migration_rollbacks(job_id, created_at);

ALTER TABLE public.tenant_migration_rollbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_migration_rollbacks_select_none ON public.tenant_migration_rollbacks;
CREATE POLICY tenant_migration_rollbacks_select_none
ON public.tenant_migration_rollbacks
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_migration_rollbacks_modify_none ON public.tenant_migration_rollbacks;
CREATE POLICY tenant_migration_rollbacks_modify_none
ON public.tenant_migration_rollbacks
FOR ALL
USING (false)
WITH CHECK (false);

DROP FUNCTION IF EXISTS public.get_tenant_migration_conflict_details(uuid, uuid, integer);
CREATE OR REPLACE FUNCTION public.get_tenant_migration_conflict_details(
  p_source_tenant_id uuid,
  p_target_tenant_id uuid,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN jsonb_build_object('success', false, 'message', 'NO_PERMISSION');
  END IF;

  IF p_source_tenant_id IS NULL OR p_target_tenant_id IS NULL OR p_source_tenant_id = p_target_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'INVALID_TENANT');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'source_tenant_id', p_source_tenant_id,
    'target_tenant_id', p_target_tenant_id,
    'member_phone_conflicts', (
      SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      FROM (
        SELECT
          s.phone_number AS phone_number,
          s.member_code AS source_member_code,
          t.member_code AS target_member_code
        FROM public.members s
        JOIN public.members t ON t.phone_number = s.phone_number
        WHERE s.tenant_id = p_source_tenant_id
          AND t.tenant_id = p_target_tenant_id
          AND s.phone_number IS NOT NULL
        ORDER BY s.phone_number
        LIMIT v_limit
      ) x
    ),
    'employee_username_conflicts', (
      SELECT COALESCE(jsonb_agg(row_to_json(y)), '[]'::jsonb)
      FROM (
        SELECT
          s.username AS username,
          s.real_name AS source_real_name,
          t.real_name AS target_real_name
        FROM public.employees s
        JOIN public.employees t ON t.username = s.username
        WHERE s.tenant_id = p_source_tenant_id
          AND t.tenant_id = p_target_tenant_id
          AND s.username IS NOT NULL
        ORDER BY s.username
        LIMIT v_limit
      ) y
    )
  );
END;
$$;

DROP FUNCTION IF EXISTS public.execute_tenant_data_migration(uuid, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.execute_tenant_data_migration(
  p_source_tenant_id uuid,
  p_target_tenant_id uuid,
  p_member_conflict_strategy text DEFAULT 'SKIP',
  p_limit integer DEFAULT 5000
)
RETURNS TABLE(
  job_id uuid,
  migrated_members integer,
  overwritten_members integer,
  skipped_members integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_actor_id uuid;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 20000);
  v_strategy text := CASE WHEN upper(COALESCE(p_member_conflict_strategy, 'SKIP')) = 'OVERWRITE' THEN 'OVERWRITE' ELSE 'SKIP' END;
  v_migrated integer := 0;
  v_overwritten integer := 0;
  v_skipped integer := 0;
  v_src public.members%ROWTYPE;
  v_tgt public.members%ROWTYPE;
  v_new_code text;
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN QUERY SELECT NULL::uuid, 0, 0, 0, 'NO_PERMISSION';
    RETURN;
  END IF;

  IF p_source_tenant_id IS NULL OR p_target_tenant_id IS NULL OR p_source_tenant_id = p_target_tenant_id THEN
    RETURN QUERY SELECT NULL::uuid, 0, 0, 0, 'INVALID_TENANT';
    RETURN;
  END IF;

  v_actor_id := public.get_current_employee_id();

  INSERT INTO public.tenant_migration_jobs (
    source_tenant_id,
    target_tenant_id,
    operation,
    status,
    report,
    created_by
  ) VALUES (
    p_source_tenant_id,
    p_target_tenant_id,
    'EXECUTE',
    'running',
    jsonb_build_object('strategy', v_strategy, 'limit', v_limit),
    v_actor_id
  ) RETURNING id INTO v_job_id;

  FOR v_src IN
    SELECT *
    FROM public.members
    WHERE tenant_id = p_source_tenant_id
    ORDER BY created_at ASC
    LIMIT v_limit
  LOOP
    SELECT *
      INTO v_tgt
    FROM public.members
    WHERE tenant_id = p_target_tenant_id
      AND phone_number = v_src.phone_number
    LIMIT 1;

    IF v_tgt.id IS NULL THEN
      v_new_code := v_src.member_code;
      WHILE EXISTS (SELECT 1 FROM public.members WHERE member_code = v_new_code) LOOP
        v_new_code := v_src.member_code || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      END LOOP;

      INSERT INTO public.members (
        member_code,
        phone_number,
        currency_preferences,
        bank_card,
        member_level,
        common_cards,
        customer_feature,
        remark,
        source_id,
        recorder_id,
        creator_id,
        tenant_id
      ) VALUES (
        v_new_code,
        v_src.phone_number,
        v_src.currency_preferences,
        v_src.bank_card,
        v_src.member_level,
        v_src.common_cards,
        v_src.customer_feature,
        v_src.remark,
        NULL, -- avoid cross-tenant source FK coupling
        NULL,
        NULL,
        p_target_tenant_id
      )
      RETURNING * INTO v_tgt;

      INSERT INTO public.tenant_migration_rollbacks (
        job_id, table_name, record_key, action, before_data
      ) VALUES (
        v_job_id, 'members', v_tgt.id::text, 'INSERT', NULL
      );

      v_migrated := v_migrated + 1;
    ELSE
      IF v_strategy = 'OVERWRITE' THEN
        INSERT INTO public.tenant_migration_rollbacks (
          job_id, table_name, record_key, action, before_data
        ) VALUES (
          v_job_id, 'members', v_tgt.id::text, 'UPDATE', to_jsonb(v_tgt)
        );

        UPDATE public.members
        SET
          currency_preferences = v_src.currency_preferences,
          bank_card = v_src.bank_card,
          member_level = v_src.member_level,
          common_cards = v_src.common_cards,
          customer_feature = v_src.customer_feature,
          remark = v_src.remark,
          updated_at = now()
        WHERE id = v_tgt.id;

        v_overwritten := v_overwritten + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.tenant_migration_jobs
  SET
    status = 'success',
    report = jsonb_build_object(
      'strategy', v_strategy,
      'limit', v_limit,
      'members', jsonb_build_object(
        'migrated', v_migrated,
        'overwritten', v_overwritten,
        'skipped', v_skipped
      )
    )
  WHERE id = v_job_id;

  RETURN QUERY SELECT v_job_id, v_migrated, v_overwritten, v_skipped, 'OK';
EXCEPTION WHEN others THEN
  IF v_job_id IS NOT NULL THEN
    UPDATE public.tenant_migration_jobs
    SET status = 'failed',
        report = COALESCE(report, '{}'::jsonb) || jsonb_build_object('error', SQLERRM)
    WHERE id = v_job_id;
  END IF;
  RETURN QUERY SELECT v_job_id, v_migrated, v_overwritten, v_skipped, SQLERRM;
END;
$$;

DROP FUNCTION IF EXISTS public.rollback_tenant_migration_job(uuid);
CREATE OR REPLACE FUNCTION public.rollback_tenant_migration_job(
  p_job_id uuid
)
RETURNS TABLE(
  success boolean,
  restored integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored integer := 0;
  v_row record;
  v_before public.members%ROWTYPE;
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN QUERY SELECT false, 0, 'NO_PERMISSION';
    RETURN;
  END IF;

  IF p_job_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 'JOB_REQUIRED';
    RETURN;
  END IF;

  FOR v_row IN
    SELECT *
    FROM public.tenant_migration_rollbacks
    WHERE job_id = p_job_id
    ORDER BY created_at DESC
  LOOP
    IF v_row.table_name = 'members' AND v_row.action = 'INSERT' THEN
      DELETE FROM public.members WHERE id = v_row.record_key::uuid;
      v_restored := v_restored + 1;
    ELSIF v_row.table_name = 'members' AND v_row.action = 'UPDATE' THEN
      SELECT * INTO v_before
      FROM jsonb_populate_record(NULL::public.members, v_row.before_data);

      UPDATE public.members
      SET
        member_code = v_before.member_code,
        phone_number = v_before.phone_number,
        currency_preferences = v_before.currency_preferences,
        bank_card = v_before.bank_card,
        member_level = v_before.member_level,
        common_cards = v_before.common_cards,
        customer_feature = v_before.customer_feature,
        remark = v_before.remark,
        source_id = v_before.source_id,
        recorder_id = v_before.recorder_id,
        creator_id = v_before.creator_id,
        tenant_id = v_before.tenant_id,
        updated_at = now()
      WHERE id = v_row.record_key::uuid;
      v_restored := v_restored + 1;
    END IF;
  END LOOP;

  UPDATE public.tenant_migration_jobs
  SET status = 'rolled_back',
      report = COALESCE(report, '{}'::jsonb) || jsonb_build_object('rollback_restored', v_restored, 'rolled_back_at', now())
  WHERE id = p_job_id;

  RETURN QUERY SELECT true, v_restored, 'OK';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_migration_conflict_details(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_tenant_data_migration(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_tenant_migration_job(uuid) TO authenticated;
