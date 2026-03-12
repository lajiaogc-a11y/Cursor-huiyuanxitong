-- Phone Extractor: pool tables, indexes, and settings
-- Multi-tenant: phone_pool scoped by tenant_id

CREATE TABLE IF NOT EXISTS phone_pool (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  raw_value TEXT NOT NULL,
  normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','consumed')),
  reserved_by UUID NULL,
  reserved_at TIMESTAMP WITH TIME ZONE NULL,
  inserted_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_pool_tenant ON phone_pool(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_pool_normalized ON phone_pool(tenant_id, normalized);
CREATE INDEX IF NOT EXISTS idx_phone_pool_status ON phone_pool(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_phone_pool_tenant_norm ON phone_pool(tenant_id, normalized);

CREATE TABLE IF NOT EXISTS phone_reservations (
  id BIGSERIAL PRIMARY KEY,
  phone_pool_id BIGINT NOT NULL REFERENCES phone_pool(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('extract','return','consume')),
  action_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_reservations_user ON phone_reservations(user_id, action_at);

CREATE TABLE IF NOT EXISTS phone_extract_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  per_extract_limit INTEGER NOT NULL DEFAULT 100,
  per_user_daily_limit INTEGER NOT NULL DEFAULT 5
);

INSERT INTO phone_extract_settings (id, per_extract_limit, per_user_daily_limit)
SELECT 1, 100, 5
WHERE NOT EXISTS (SELECT 1 FROM phone_extract_settings WHERE id = 1);

-- RLS: tenant-scoped
ALTER TABLE phone_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_extract_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phone_pool_tenant ON phone_pool;
CREATE POLICY phone_pool_tenant ON phone_pool
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT e.tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT e.tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS phone_reservations_select ON phone_reservations;
CREATE POLICY phone_reservations_select ON phone_reservations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM phone_pool pp WHERE pp.id = phone_reservations.phone_pool_id
      AND (pp.tenant_id = (SELECT e.tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
        OR public.is_platform_super_admin(auth.uid())))
  );

DROP POLICY IF EXISTS phone_reservations_insert ON phone_reservations;
CREATE POLICY phone_reservations_insert ON phone_reservations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS phone_extract_settings_select ON phone_extract_settings;
CREATE POLICY phone_extract_settings_select ON phone_extract_settings
  FOR SELECT TO authenticated USING (true);
