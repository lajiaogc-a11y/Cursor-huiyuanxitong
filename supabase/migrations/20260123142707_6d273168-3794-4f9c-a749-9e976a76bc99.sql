-- 添加总管理员标记字段
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- 将最早创建的管理员设为总管理员
UPDATE public.employees 
SET is_super_admin = true 
WHERE id = (
  SELECT id FROM public.employees 
  WHERE role = 'admin' 
  ORDER BY created_at ASC 
  LIMIT 1
);