-- 创建行业知识分类表
CREATE TABLE public.knowledge_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text', -- text, phrase, image
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建行业知识文章表
CREATE TABLE public.knowledge_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.knowledge_categories(id) ON DELETE CASCADE,
  title_zh TEXT NOT NULL,
  title_en TEXT,
  content TEXT,
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建用户阅读状态表
CREATE TABLE public.knowledge_read_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, article_id)
);

-- 启用RLS
ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_read_status ENABLE ROW LEVEL SECURITY;

-- 分类表策略
CREATE POLICY "所有员工可查看分类" ON public.knowledge_categories
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "管理员可管理分类" ON public.knowledge_categories
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- 文章表策略
CREATE POLICY "所有员工可查看已发布文章" ON public.knowledge_articles
  FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "管理员可管理文章" ON public.knowledge_articles
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- 阅读状态表策略
CREATE POLICY "员工可查看自己的阅读状态" ON public.knowledge_read_status
  FOR SELECT USING (employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "员工可插入自己的阅读状态" ON public.knowledge_read_status
  FOR INSERT WITH CHECK (employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid()));

-- 插入默认分类
INSERT INTO public.knowledge_categories (name, content_type, sort_order) VALUES
  ('公司通知', 'text', 1),
  ('行业知识', 'text', 2),
  ('兑卡指南', 'image', 3),
  ('常用话术', 'phrase', 4);

-- 创建存储桶用于图片上传
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-images', 'knowledge-images', true);

-- 存储桶策略
CREATE POLICY "管理员可上传图片" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'knowledge-images' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

CREATE POLICY "所有人可查看图片" ON storage.objects
  FOR SELECT USING (bucket_id = 'knowledge-images');

CREATE POLICY "管理员可删除图片" ON storage.objects
  FOR DELETE USING (bucket_id = 'knowledge-images' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));