-- Issue 1: Add visibility column to knowledge_articles table
-- Super Admin can set visibility (public/private)
-- Other roles: articles are private by default (only visible to creator)
ALTER TABLE knowledge_articles 
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

-- Add constraint to ensure valid values
ALTER TABLE knowledge_articles 
ADD CONSTRAINT knowledge_articles_visibility_check 
CHECK (visibility IN ('public', 'private'));

-- Ensure created_by is not null for new articles (but allow existing nulls)
-- Comment: created_by already exists but some may be null for legacy data