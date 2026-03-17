-- Data migration tools (fourth batch)
-- 1) post-migration verification report
-- 2) audit bundle export payload

CREATE OR REPLACE FUNCTION public.verify_tenant_migration_job(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.tenant_migration_jobs%ROWTYPE;
  v_has_orders_tenant_id boolean := false;
  v_source_employees integer := 0;
  v_source_members integer := 0;
  v_source_orders integer := 0;
  v_target_employees integer := 0;
  v_target_members integer := 0;
  v_target_orders integer := 0;
  v_report jsonb;
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

  SELECT EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'tenant_id'
  ) INTO v_has_orders_tenant_id;

  SELECT COUNT(*)::integer INTO v_source_employees
  FROM public.employees
  WHERE tenant_id = v_job.source_tenant_id;

  SELECT COUNT(*)::integer INTO v_source_members
  FROM public.members
  WHERE tenant_id = v_job.source_tenant_id;

  IF v_has_orders_tenant_id THEN
    SELECT COUNT(*)::integer INTO v_source_orders
    FROM public.orders
    WHERE tenant_id = v_job.source_tenant_id
      AND COALESCE(is_deleted, false) = false;
  ELSE
    SELECT COUNT(*)::integer INTO v_source_orders
    FROM public.orders o
    WHERE COALESCE(o.is_deleted, false) = false
      AND (
        EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = v_job.source_tenant_id)
        OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_job.source_tenant_id)
      );
  END IF;

  IF v_job.target_tenant_id IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_target_employees
    FROM public.employees
    WHERE tenant_id = v_job.target_tenant_id;

    SELECT COUNT(*)::integer INTO v_target_members
    FROM public.members
    WHERE tenant_id = v_job.target_tenant_id;

    IF v_has_orders_tenant_id THEN
      SELECT COUNT(*)::integer INTO v_target_orders
      FROM public.orders
      WHERE tenant_id = v_job.target_tenant_id
        AND COALESCE(is_deleted, false) = false;
    ELSE
      SELECT COUNT(*)::integer INTO v_target_orders
      FROM public.orders o
      WHERE COALESCE(o.is_deleted, false) = false
        AND (
          EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.creator_id AND e.tenant_id = v_job.target_tenant_id)
          OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_job.target_tenant_id)
        );
    END IF;
  END IF;

  v_report := jsonb_build_object(
    'checked_at', now(),
    'job_id', v_job.id,
    'operation', v_job.operation,
    'job_status', v_job.status,
    'source_tenant_id', v_job.source_tenant_id,
    'target_tenant_id', v_job.target_tenant_id,
    'source_counts', jsonb_build_object(
      'employees', v_source_employees,
      'members', v_source_members,
      'orders', v_source_orders
    ),
    'target_counts', jsonb_build_object(
      'employees', v_target_employees,
      'members', v_target_members,
      'orders', v_target_orders
    )
  );

  UPDATE public.tenant_migration_jobs
  SET report = COALESCE(report, '{}'::jsonb) || jsonb_build_object('latest_verification', v_report)
  WHERE id = v_job.id;

  RETURN jsonb_build_object('success', true, 'verification', v_report);
END;
$$;

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

  RETURN jsonb_build_object(
    'success', true,
    'exported_at', now(),
    'job', to_jsonb(v_job),
    'verification', v_verification,
    'conflicts', v_conflicts,
    'rollbacks', v_rollbacks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_tenant_migration_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_tenant_migration_audit_bundle(uuid, integer) TO authenticated;
