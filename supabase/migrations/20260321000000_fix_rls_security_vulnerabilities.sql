-- 修复 Supabase Security Linter 报告的 RLS 漏洞
-- 1. policy_exists_rls_disabled: 表有 RLS 策略但 RLS 未启用（由 20260311000002 临时禁用后未恢复）
-- 2. rls_disabled_in_public: public schema 表暴露给 PostgREST 但 RLS 未启用
-- 3. sensitive_columns_exposed: webhooks 表含敏感列 secret 且无 RLS 保护
--
-- 修复方案：重新启用所有受影响表的 RLS

-- ========== 第一组：曾被 restore_disable_rls_temporarily 禁用的表（已有策略） ==========
ALTER TABLE IF EXISTS public.activity_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.balance_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.card_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_name_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.exchange_rate_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invitation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.navigation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.points_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referral_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.report_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_data_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shift_receivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_data_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhooks ENABLE ROW LEVEL SECURITY;

-- ========== 第二组：会员游戏化等新表（无策略，启用 RLS 后仅通过 RPC 访问） ==========
-- 这些表通过 SECURITY DEFINER RPC 访问，启用 RLS 可阻止直接 API 访问，提升安全性
ALTER TABLE IF EXISTS public.spins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.member_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;

-- ========== 为无策略的表添加最小必要策略（防止 RPC 外的直接访问被完全拒绝导致功能异常） ==========
-- tenants: 平台管理员可看全部，普通员工仅可看本租户（租户切换器等）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND schemaname = 'public'
  ) THEN
    CREATE POLICY tenants_authenticated_select ON public.tenants
      FOR SELECT TO authenticated
      USING (
        (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
        AND (
          public.is_platform_super_admin(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.employees e ON e.id = p.employee_id
            WHERE p.id = auth.uid() AND e.tenant_id = tenants.id
          )
        )
      );
  END IF;
END $$;

-- spins, prizes, redemptions, check_ins, member_invites, member_transactions: 员工按租户隔离访问
-- 通过 member 的 creator_id/recorder_id 关联员工 tenant_id
DO $$
BEGIN
  -- spins
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spins' AND schemaname = 'public') THEN
    CREATE POLICY spins_employee_all ON public.spins FOR ALL TO authenticated
    USING (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
      AND (
        public.is_platform_super_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.id = spins.member_id
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
    WITH CHECK (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
    );
  END IF;
END $$;

DO $$
BEGIN
  -- prizes: 员工可查看，admin/manager 可增删改（奖品池为租户内共享）
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prizes' AND schemaname = 'public') THEN
    CREATE POLICY prizes_employee_select ON public.prizes FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role));
    CREATE POLICY prizes_admin_manager_insert ON public.prizes FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
    CREATE POLICY prizes_admin_manager_update ON public.prizes FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
    CREATE POLICY prizes_admin_manager_delete ON public.prizes FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
  END IF;
END $$;

DO $$
BEGIN
  -- redemptions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'redemptions' AND schemaname = 'public') THEN
    CREATE POLICY redemptions_employee_all ON public.redemptions FOR ALL TO authenticated
    USING (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
      AND (
        public.is_platform_super_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.id = redemptions.member_id
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
    WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));
  END IF;
END $$;

DO $$
BEGIN
  -- check_ins
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'check_ins' AND schemaname = 'public') THEN
    CREATE POLICY check_ins_employee_all ON public.check_ins FOR ALL TO authenticated
    USING (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
      AND (
        public.is_platform_super_admin(auth.uid())
        OR (check_ins.member_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.id = check_ins.member_id
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        ))
        OR (check_ins.phone_number IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.phone_number = check_ins.phone_number
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        ))
      )
    )
    WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));
  END IF;
END $$;

DO $$
BEGIN
  -- member_invites
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_invites' AND schemaname = 'public') THEN
    CREATE POLICY member_invites_employee_all ON public.member_invites FOR ALL TO authenticated
    USING (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
      AND (
        public.is_platform_super_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.id = member_invites.inviter_id
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
    WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));
  END IF;
END $$;

DO $$
BEGIN
  -- member_transactions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_transactions' AND schemaname = 'public') THEN
    CREATE POLICY member_transactions_employee_all ON public.member_transactions FOR ALL TO authenticated
    USING (
      (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
      AND (
        public.is_platform_super_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.employees e ON e.id = p.employee_id
          JOIN public.members m ON m.id = member_transactions.member_id
          WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
          AND (
            (m.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.creator_id AND e2.tenant_id = e.tenant_id))
            OR (m.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = m.recorder_id AND e2.tenant_id = e.tenant_id))
          )
        )
      )
    )
    WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role)));
  END IF;
END $$;

-- otp_verifications: 敏感数据，仅通过 RPC 访问，不添加策略（启用 RLS 即拒绝直接 API 访问）
-- 无需额外策略，RLS 启用后默认拒绝所有直接访问，RPC 的 SECURITY DEFINER 会绕过
