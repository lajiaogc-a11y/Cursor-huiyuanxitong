-- Data migration tools (third batch)
-- Extend execute migration to employees + orders with rollback support

DROP FUNCTION IF EXISTS public.execute_tenant_data_migration(uuid, uuid, text, integer);

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
    ),
    'order_number_conflicts', (
      SELECT COALESCE(jsonb_agg(row_to_json(z)), '[]'::jsonb)
      FROM (
        SELECT s.order_number AS order_number
        FROM public.orders s
        JOIN public.orders t ON t.order_number = s.order_number
        WHERE s.tenant_id = p_source_tenant_id
          AND t.tenant_id = p_target_tenant_id
        ORDER BY s.order_number
        LIMIT v_limit
      ) z
    )
  );
END;
$$;

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
  migrated_employees integer,
  overwritten_employees integer,
  skipped_employees integer,
  migrated_orders integer,
  skipped_orders integer,
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
  v_has_orders_tenant_id boolean := false;
  v_source_employee public.employees%ROWTYPE;
  v_target_employee public.employees%ROWTYPE;
  v_source_member public.members%ROWTYPE;
  v_target_member public.members%ROWTYPE;
  v_source_order public.orders%ROWTYPE;
  v_new_member_code text;
  v_new_real_name text;
  v_new_order_number text;
  v_target_member_id uuid;
  v_target_creator_id uuid;
  v_target_sales_id uuid;
  v_migrated_members integer := 0;
  v_overwritten_members integer := 0;
  v_skipped_members integer := 0;
  v_migrated_employees integer := 0;
  v_overwritten_employees integer := 0;
  v_skipped_employees integer := 0;
  v_migrated_orders integer := 0;
  v_skipped_orders integer := 0;
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN QUERY SELECT NULL::uuid,0,0,0,0,0,0,0,0,'NO_PERMISSION';
    RETURN;
  END IF;

  IF p_source_tenant_id IS NULL OR p_target_tenant_id IS NULL OR p_source_tenant_id = p_target_tenant_id THEN
    RETURN QUERY SELECT NULL::uuid,0,0,0,0,0,0,0,0,'INVALID_TENANT';
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='tenant_id'
  ) INTO v_has_orders_tenant_id;

  v_actor_id := public.get_current_employee_id();

  INSERT INTO public.tenant_migration_jobs (
    source_tenant_id, target_tenant_id, operation, status, report, created_by
  ) VALUES (
    p_source_tenant_id,
    p_target_tenant_id,
    'EXECUTE',
    'running',
    jsonb_build_object('strategy', v_strategy, 'limit', v_limit, 'scope', jsonb_build_array('employees','members','orders')),
    v_actor_id
  ) RETURNING id INTO v_job_id;

  CREATE TEMP TABLE IF NOT EXISTS tmp_employee_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS tmp_member_map (
    source_id uuid PRIMARY KEY,
    target_id uuid NOT NULL
  ) ON COMMIT DROP;

  -- 1) employees
  FOR v_source_employee IN
    SELECT *
    FROM public.employees
    WHERE tenant_id = p_source_tenant_id
      AND COALESCE(is_super_admin, false) = false
    ORDER BY created_at ASC
    LIMIT v_limit
  LOOP
    SELECT * INTO v_target_employee
    FROM public.employees
    WHERE username = v_source_employee.username
    LIMIT 1;

    IF v_target_employee.id IS NULL THEN
      v_new_real_name := v_source_employee.real_name;
      WHILE EXISTS (
        SELECT 1 FROM public.employees
        WHERE real_name = v_new_real_name
      ) LOOP
        v_new_real_name := v_source_employee.real_name || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      END LOOP;

      INSERT INTO public.employees (
        username,
        real_name,
        password_hash,
        role,
        status,
        visible,
        tenant_id
      ) VALUES (
        v_source_employee.username,
        v_new_real_name,
        v_source_employee.password_hash,
        v_source_employee.role,
        v_source_employee.status,
        COALESCE(v_source_employee.visible, false),
        p_target_tenant_id
      )
      RETURNING * INTO v_target_employee;

      INSERT INTO public.tenant_migration_rollbacks (job_id, table_name, record_key, action, before_data)
      VALUES (v_job_id, 'employees', v_target_employee.id::text, 'INSERT', NULL);

      v_migrated_employees := v_migrated_employees + 1;
      INSERT INTO tmp_employee_map(source_id, target_id) VALUES (v_source_employee.id, v_target_employee.id)
      ON CONFLICT (source_id) DO UPDATE SET target_id = EXCLUDED.target_id;
    ELSE
      IF v_target_employee.tenant_id = p_target_tenant_id THEN
        INSERT INTO tmp_employee_map(source_id, target_id) VALUES (v_source_employee.id, v_target_employee.id)
        ON CONFLICT (source_id) DO UPDATE SET target_id = EXCLUDED.target_id;

        IF v_strategy = 'OVERWRITE' THEN
          INSERT INTO public.tenant_migration_rollbacks (job_id, table_name, record_key, action, before_data)
          VALUES (v_job_id, 'employees', v_target_employee.id::text, 'UPDATE', to_jsonb(v_target_employee));

          UPDATE public.employees
          SET
            role = v_source_employee.role,
            status = v_source_employee.status,
            visible = COALESCE(v_source_employee.visible, false),
            password_hash = v_source_employee.password_hash,
            updated_at = now()
          WHERE id = v_target_employee.id;

          v_overwritten_employees := v_overwritten_employees + 1;
        ELSE
          v_skipped_employees := v_skipped_employees + 1;
        END IF;
      ELSE
        v_skipped_employees := v_skipped_employees + 1;
      END IF;
    END IF;
  END LOOP;

  -- 2) members
  FOR v_source_member IN
    SELECT *
    FROM public.members
    WHERE tenant_id = p_source_tenant_id
    ORDER BY created_at ASC
    LIMIT v_limit
  LOOP
    SELECT * INTO v_target_member
    FROM public.members
    WHERE tenant_id = p_target_tenant_id
      AND phone_number = v_source_member.phone_number
    LIMIT 1;

    IF v_target_member.id IS NULL THEN
      v_new_member_code := v_source_member.member_code;
      WHILE EXISTS (SELECT 1 FROM public.members WHERE member_code = v_new_member_code) LOOP
        v_new_member_code := v_source_member.member_code || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
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
        v_new_member_code,
        v_source_member.phone_number,
        v_source_member.currency_preferences,
        v_source_member.bank_card,
        v_source_member.member_level,
        v_source_member.common_cards,
        v_source_member.customer_feature,
        v_source_member.remark,
        NULL,
        NULL,
        NULL,
        p_target_tenant_id
      )
      RETURNING * INTO v_target_member;

      INSERT INTO public.tenant_migration_rollbacks (job_id, table_name, record_key, action, before_data)
      VALUES (v_job_id, 'members', v_target_member.id::text, 'INSERT', NULL);

      v_migrated_members := v_migrated_members + 1;
      INSERT INTO tmp_member_map(source_id, target_id) VALUES (v_source_member.id, v_target_member.id)
      ON CONFLICT (source_id) DO UPDATE SET target_id = EXCLUDED.target_id;
    ELSE
      INSERT INTO tmp_member_map(source_id, target_id) VALUES (v_source_member.id, v_target_member.id)
      ON CONFLICT (source_id) DO UPDATE SET target_id = EXCLUDED.target_id;

      IF v_strategy = 'OVERWRITE' THEN
        INSERT INTO public.tenant_migration_rollbacks (job_id, table_name, record_key, action, before_data)
        VALUES (v_job_id, 'members', v_target_member.id::text, 'UPDATE', to_jsonb(v_target_member));

        UPDATE public.members
        SET
          currency_preferences = v_source_member.currency_preferences,
          bank_card = v_source_member.bank_card,
          member_level = v_source_member.member_level,
          common_cards = v_source_member.common_cards,
          customer_feature = v_source_member.customer_feature,
          remark = v_source_member.remark,
          updated_at = now()
        WHERE id = v_target_member.id;

        v_overwritten_members := v_overwritten_members + 1;
      ELSE
        v_skipped_members := v_skipped_members + 1;
      END IF;
    END IF;
  END LOOP;

  -- 3) orders
  FOR v_source_order IN
    SELECT *
    FROM public.orders
    WHERE tenant_id = p_source_tenant_id
      AND COALESCE(is_deleted, false) = false
    ORDER BY created_at ASC
    LIMIT v_limit
  LOOP
    v_target_member_id := NULL;
    v_target_creator_id := NULL;
    v_target_sales_id := NULL;

    IF v_source_order.member_id IS NOT NULL THEN
      SELECT m.target_id INTO v_target_member_id
      FROM tmp_member_map m
      WHERE m.source_id = v_source_order.member_id
      LIMIT 1;
    END IF;

    IF v_target_member_id IS NULL AND v_source_order.phone_number IS NOT NULL THEN
      SELECT id INTO v_target_member_id
      FROM public.members
      WHERE tenant_id = p_target_tenant_id
        AND phone_number = v_source_order.phone_number
      LIMIT 1;
    END IF;

    IF v_source_order.creator_id IS NOT NULL THEN
      SELECT e.target_id INTO v_target_creator_id
      FROM tmp_employee_map e
      WHERE e.source_id = v_source_order.creator_id
      LIMIT 1;
    END IF;

    IF v_source_order.sales_user_id IS NOT NULL THEN
      SELECT e.target_id INTO v_target_sales_id
      FROM tmp_employee_map e
      WHERE e.source_id = v_source_order.sales_user_id
      LIMIT 1;
    END IF;

    IF v_target_creator_id IS NULL AND v_target_sales_id IS NULL THEN
      v_skipped_orders := v_skipped_orders + 1;
      CONTINUE;
    END IF;

    v_new_order_number := v_source_order.order_number;
    WHILE EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_new_order_number) LOOP
      v_new_order_number := v_source_order.order_number || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END LOOP;

    IF v_has_orders_tenant_id THEN
      INSERT INTO public.orders (
        order_number,
        sales_user_id,
        order_type,
        vendor_id,
        card_merchant_id,
        amount,
        actual_payment,
        currency,
        exchange_rate,
        foreign_rate,
        fee,
        profit_ngn,
        profit_usdt,
        card_value,
        payment_value,
        member_id,
        phone_number,
        status,
        remark,
        completed_at,
        creator_id,
        order_points,
        points_status,
        profit_rate,
        tenant_id
      ) VALUES (
        v_new_order_number,
        v_target_sales_id,
        v_source_order.order_type,
        v_source_order.vendor_id,
        v_source_order.card_merchant_id,
        v_source_order.amount,
        v_source_order.actual_payment,
        v_source_order.currency,
        v_source_order.exchange_rate,
        v_source_order.foreign_rate,
        v_source_order.fee,
        v_source_order.profit_ngn,
        v_source_order.profit_usdt,
        v_source_order.card_value,
        v_source_order.payment_value,
        v_target_member_id,
        v_source_order.phone_number,
        v_source_order.status,
        v_source_order.remark,
        v_source_order.completed_at,
        v_target_creator_id,
        v_source_order.order_points,
        v_source_order.points_status,
        v_source_order.profit_rate,
        p_target_tenant_id
      )
      RETURNING id INTO v_target_member_id;
    ELSE
      INSERT INTO public.orders (
        order_number,
        sales_user_id,
        order_type,
        vendor_id,
        card_merchant_id,
        amount,
        actual_payment,
        currency,
        exchange_rate,
        foreign_rate,
        fee,
        profit_ngn,
        profit_usdt,
        card_value,
        payment_value,
        member_id,
        phone_number,
        status,
        remark,
        completed_at,
        creator_id,
        order_points,
        points_status,
        profit_rate
      ) VALUES (
        v_new_order_number,
        v_target_sales_id,
        v_source_order.order_type,
        v_source_order.vendor_id,
        v_source_order.card_merchant_id,
        v_source_order.amount,
        v_source_order.actual_payment,
        v_source_order.currency,
        v_source_order.exchange_rate,
        v_source_order.foreign_rate,
        v_source_order.fee,
        v_source_order.profit_ngn,
        v_source_order.profit_usdt,
        v_source_order.card_value,
        v_source_order.payment_value,
        v_target_member_id,
        v_source_order.phone_number,
        v_source_order.status,
        v_source_order.remark,
        v_source_order.completed_at,
        v_target_creator_id,
        v_source_order.order_points,
        v_source_order.points_status,
        v_source_order.profit_rate
      )
      RETURNING id INTO v_target_member_id;
    END IF;

    INSERT INTO public.tenant_migration_rollbacks (job_id, table_name, record_key, action, before_data)
    VALUES (v_job_id, 'orders', v_target_member_id::text, 'INSERT', NULL);

    v_migrated_orders := v_migrated_orders + 1;
  END LOOP;

  UPDATE public.tenant_migration_jobs
  SET
    status = 'success',
    report = jsonb_build_object(
      'strategy', v_strategy,
      'limit', v_limit,
      'employees', jsonb_build_object(
        'migrated', v_migrated_employees,
        'overwritten', v_overwritten_employees,
        'skipped', v_skipped_employees
      ),
      'members', jsonb_build_object(
        'migrated', v_migrated_members,
        'overwritten', v_overwritten_members,
        'skipped', v_skipped_members
      ),
      'orders', jsonb_build_object(
        'migrated', v_migrated_orders,
        'skipped', v_skipped_orders
      )
    )
  WHERE id = v_job_id;

  RETURN QUERY
  SELECT
    v_job_id,
    v_migrated_members,
    v_overwritten_members,
    v_skipped_members,
    v_migrated_employees,
    v_overwritten_employees,
    v_skipped_employees,
    v_migrated_orders,
    v_skipped_orders,
    'OK';
EXCEPTION WHEN others THEN
  IF v_job_id IS NOT NULL THEN
    UPDATE public.tenant_migration_jobs
    SET status = 'failed',
        report = COALESCE(report, '{}'::jsonb) || jsonb_build_object('error', SQLERRM)
    WHERE id = v_job_id;
  END IF;
  RETURN QUERY
  SELECT
    v_job_id,
    v_migrated_members,
    v_overwritten_members,
    v_skipped_members,
    v_migrated_employees,
    v_overwritten_employees,
    v_skipped_employees,
    v_migrated_orders,
    v_skipped_orders,
    SQLERRM;
END;
$$;

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
  v_before_member public.members%ROWTYPE;
  v_before_employee public.employees%ROWTYPE;
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
    IF v_row.table_name = 'members' THEN
      IF v_row.action = 'INSERT' THEN
        DELETE FROM public.members WHERE id = v_row.record_key::uuid;
        v_restored := v_restored + 1;
      ELSIF v_row.action = 'UPDATE' THEN
        SELECT * INTO v_before_member
        FROM jsonb_populate_record(NULL::public.members, v_row.before_data);
        UPDATE public.members
        SET
          member_code = v_before_member.member_code,
          phone_number = v_before_member.phone_number,
          currency_preferences = v_before_member.currency_preferences,
          bank_card = v_before_member.bank_card,
          member_level = v_before_member.member_level,
          common_cards = v_before_member.common_cards,
          customer_feature = v_before_member.customer_feature,
          remark = v_before_member.remark,
          source_id = v_before_member.source_id,
          recorder_id = v_before_member.recorder_id,
          creator_id = v_before_member.creator_id,
          tenant_id = v_before_member.tenant_id,
          updated_at = now()
        WHERE id = v_row.record_key::uuid;
        v_restored := v_restored + 1;
      END IF;
    ELSIF v_row.table_name = 'employees' THEN
      IF v_row.action = 'INSERT' THEN
        DELETE FROM public.employees WHERE id = v_row.record_key::uuid;
        v_restored := v_restored + 1;
      ELSIF v_row.action = 'UPDATE' THEN
        SELECT * INTO v_before_employee
        FROM jsonb_populate_record(NULL::public.employees, v_row.before_data);
        UPDATE public.employees
        SET
          username = v_before_employee.username,
          real_name = v_before_employee.real_name,
          password_hash = v_before_employee.password_hash,
          role = v_before_employee.role,
          status = v_before_employee.status,
          visible = v_before_employee.visible,
          tenant_id = v_before_employee.tenant_id,
          updated_at = now()
        WHERE id = v_row.record_key::uuid;
        v_restored := v_restored + 1;
      END IF;
    ELSIF v_row.table_name = 'orders' THEN
      IF v_row.action = 'INSERT' THEN
        DELETE FROM public.orders WHERE id = v_row.record_key::uuid;
        v_restored := v_restored + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.tenant_migration_jobs
  SET status = 'rolled_back',
      report = COALESCE(report, '{}'::jsonb) || jsonb_build_object('rollback_restored', v_restored, 'rolled_back_at', now())
  WHERE id = p_job_id;

  RETURN QUERY SELECT true, v_restored, 'OK';
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_tenant_data_migration(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_migration_conflict_details(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_tenant_migration_job(uuid) TO authenticated;
