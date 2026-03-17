-- Data migration tools (hardening)
-- 1) audit bundle signature digest
-- 2) job list pagination + filters

CREATE OR REPLACE FUNCTION public.export_tenant_migration_audit_bundle(
  p_job_id uuid,
  p_conflict_limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.tenant_migration_jobs%ROWTYPE;
  v_verification jsonb;
  v_conflicts jsonb := '{}'::jsonb;
  v_rollbacks jsonb := '[]'::jsonb;
  v_core jsonb;
  v_hash text;
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN jsonb_build_object('success', false, 'message', 'NO_PERMISSION');
  END IF;

  IF p_job_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'JOB_REQUIRED');
  END IF;

  SELECT * INTO v_job
  FROM public.tenant_migration_jobs
  WHERE id = p_job_id
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'JOB_NOT_FOUND');
  END IF;

  v_verification := public.verify_tenant_migration_job(p_job_id);

  IF v_job.target_tenant_id IS NOT NULL THEN
    v_conflicts := public.get_tenant_migration_conflict_details(
      v_job.source_tenant_id,
      v_job.target_tenant_id,
      p_conflict_limit
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rollbacks
  FROM public.tenant_migration_rollbacks r
  WHERE r.job_id = p_job_id;

  v_core := jsonb_build_object(
    'job', to_jsonb(v_job),
    'verification', v_verification,
    'conflicts', v_conflicts,
    'rollbacks', v_rollbacks
  );

  v_hash := encode(digest(v_core::text, 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'success', true,
    'exported_at', now(),
    'bundle_hash_sha256', v_hash,
    'bundle', v_core
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_migration_jobs_v2(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_operation text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  source_tenant_id uuid,
  target_tenant_id uuid,
  operation text,
  status text,
  report jsonb,
  created_by uuid,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 200);
  v_offset integer := (v_page - 1) * v_page_size;
  v_operation text := NULLIF(trim(COALESCE(p_operation, '')), '');
  v_status text := NULLIF(trim(COALESCE(p_status, '')), '');
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT j.*
    FROM public.tenant_migration_jobs j
    WHERE (v_operation IS NULL OR j.operation = v_operation)
      AND (v_status IS NULL OR j.status = v_status)
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total_count
    FROM filtered
  )
  SELECT
    f.id,
    f.source_tenant_id,
    f.target_tenant_id,
    f.operation,
    f.status,
    f.report,
    f.created_by,
    f.created_at,
    c.total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_tenant_migration_audit_bundle(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_migration_jobs_v2(integer, integer, text, text) TO authenticated;
