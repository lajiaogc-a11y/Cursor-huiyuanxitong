-- 当 knowledge_categories 为空时，插入默认分类
-- 解决公司文档页面无数据问题
INSERT INTO public.knowledge_categories (name, content_type, sort_order, visibility)
SELECT v.name, v.content_type, v.sort_order, v.visibility FROM (VALUES
  ('公司通知', 'text', 1, 'public'),
  ('行业知识', 'text', 2, 'public'),
  ('兑卡指南', 'image', 3, 'public'),
  ('常用话术', 'phrase', 4, 'public')
) AS v(name, content_type, sort_order, visibility)
WHERE NOT EXISTS (SELECT 1 FROM public.knowledge_categories LIMIT 1);
