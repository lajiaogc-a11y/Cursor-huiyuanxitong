-- 删除旧约束
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;

-- 添加新约束，包含 'pending' 状态
ALTER TABLE public.employees ADD CONSTRAINT employees_status_check 
  CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'pending'::text]));