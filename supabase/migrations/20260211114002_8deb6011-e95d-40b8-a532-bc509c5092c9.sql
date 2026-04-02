CREATE POLICY "balance_change_logs_employee_update"
  ON public.balance_change_logs
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manager'::app_role) OR
    has_role(auth.uid(), 'staff'::app_role)
  );