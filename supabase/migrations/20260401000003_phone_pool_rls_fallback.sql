-- Phone pool RLS: use get_my_tenant_id() for consistency (handles profiles.employee_id null)
DROP POLICY IF EXISTS phone_pool_tenant ON phone_pool;
CREATE POLICY phone_pool_tenant ON phone_pool
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    OR public.is_platform_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS phone_reservations_select ON phone_reservations;
CREATE POLICY phone_reservations_select ON phone_reservations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM phone_pool pp WHERE pp.id = phone_reservations.phone_pool_id
      AND (pp.tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid())))
  );
