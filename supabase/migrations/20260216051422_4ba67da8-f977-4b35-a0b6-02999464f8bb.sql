
-- Revoke SELECT on password_hash column from authenticated and anon roles
-- This prevents any client query from reading password_hash, even with SELECT *
REVOKE SELECT (password_hash) ON public.employees FROM authenticated;
REVOKE SELECT (password_hash) ON public.employees FROM anon;

-- Ensure the other columns remain accessible
GRANT SELECT (id, username, real_name, role, status, visible, is_super_admin, created_at, updated_at) ON public.employees TO authenticated;
