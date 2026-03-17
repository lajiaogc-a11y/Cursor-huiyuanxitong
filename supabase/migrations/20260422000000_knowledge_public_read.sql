-- 公司文档：允许匿名读取，确保有数据就能看到
-- 执行方式：Supabase SQL Editor 或 npm run db:knowledge-public-read
DROP POLICY IF EXISTS "知识库分类公开可读" ON public.knowledge_categories;
DROP POLICY IF EXISTS "知识库文章公开可读" ON public.knowledge_articles;
CREATE POLICY "知识库分类公开可读" ON public.knowledge_categories FOR SELECT USING (true);
CREATE POLICY "知识库文章公开可读" ON public.knowledge_articles FOR SELECT USING (is_published = true);
