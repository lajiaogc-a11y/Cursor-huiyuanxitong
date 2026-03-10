-- 为 shift_handovers 表添加删除策略（允许所有员工删除交班记录）
CREATE POLICY "Employees can delete shift handovers"
ON public.shift_handovers
FOR DELETE
USING (true);