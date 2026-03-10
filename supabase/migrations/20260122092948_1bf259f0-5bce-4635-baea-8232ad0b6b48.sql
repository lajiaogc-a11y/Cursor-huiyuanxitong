-- 给 cards 表添加 sort_order 字段
ALTER TABLE public.cards 
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;