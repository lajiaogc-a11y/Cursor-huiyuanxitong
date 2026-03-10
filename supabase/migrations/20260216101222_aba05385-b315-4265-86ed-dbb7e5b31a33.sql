
-- Fix shift_handovers SELECT policy: restrict staff to own records, admin/manager see all
DROP POLICY IF EXISTS "employees_can_view_shift_handovers" ON public.shift_handovers;

CREATE POLICY "shift_handovers_select_own_or_admin"
ON public.shift_handovers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (
    has_role(auth.uid(), 'staff'::app_role) 
    AND handover_employee_id = get_employee_id(auth.uid())
  )
);
