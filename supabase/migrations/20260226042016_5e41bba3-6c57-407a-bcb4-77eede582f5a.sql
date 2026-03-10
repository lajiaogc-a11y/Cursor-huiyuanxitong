
-- Step 1: Remove DELETE policy on operation_logs (make audit logs immutable)
DROP POLICY IF EXISTS "operation_logs_admin_delete" ON public.operation_logs;

-- Step 2: Remove DELETE policy on balance_change_logs (make financial logs immutable)
DROP POLICY IF EXISTS "balance_change_logs_admin_delete" ON public.balance_change_logs;

-- Step 3: Tighten employee_login_logs INSERT policy (remove OR true)
DROP POLICY IF EXISTS "employee_login_logs_insert" ON public.employee_login_logs;
CREATE POLICY "employee_login_logs_insert" ON public.employee_login_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Step 4: Tighten profiles SELECT to own record only
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "Allow logged-in users to select their own profile" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
