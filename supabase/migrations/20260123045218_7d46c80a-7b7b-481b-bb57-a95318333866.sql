-- 为 shift_receivers 表添加 DELETE 策略（管理员/经理可删除）
CREATE POLICY "shift_receivers_admin_manager_delete"
ON public.shift_receivers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 为 audit_records 表添加 DELETE 策略（仅管理员可删除）
CREATE POLICY "audit_records_admin_delete"
ON public.audit_records
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 为 operation_logs 表添加 DELETE 策略（仅管理员可删除）
CREATE POLICY "operation_logs_admin_delete"
ON public.operation_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));