
-- Make knowledge-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'knowledge-images';

-- Add SELECT policy for authenticated employees to read images
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'employees_can_view_knowledge_images') THEN
    CREATE POLICY "employees_can_view_knowledge_images"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'knowledge-images'
        AND (
          has_role(auth.uid(), 'admin'::public.app_role)
          OR has_role(auth.uid(), 'manager'::public.app_role)
          OR has_role(auth.uid(), 'staff'::public.app_role)
        )
      );
  END IF;
END $$;
