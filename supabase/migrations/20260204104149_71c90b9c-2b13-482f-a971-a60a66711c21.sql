-- 为 knowledge_read_status 表添加 UPDATE 策略以支持 upsert 操作
CREATE POLICY "员工可更新自己的阅读状态" ON public.knowledge_read_status
  FOR UPDATE 
  USING (employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid()));