-- Add visibility field to knowledge_categories table
ALTER TABLE knowledge_categories 
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

-- Add comment for clarity
COMMENT ON COLUMN knowledge_categories.visibility IS 'public: visible to all; private: only visible to creator';