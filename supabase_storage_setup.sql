-- Supabase Storage Setup for Product Images
-- Run this in the Supabase SQL Editor

-- Create the storage bucket for product images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for product images bucket
-- Allow public read access to product images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to upload images
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Allow authenticated users to update their own uploads
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

-- Allow authenticated users to delete images
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- Note: These policies require users to be authenticated.
-- For a POS system, you should have proper authentication setup.
-- If you need to allow unauthenticated uploads for demo purposes, 
-- you can temporarily use these policies instead:

-- DEMO/DEVELOPMENT ONLY - Uncomment these and comment the above if needed:
/*
CREATE POLICY "Demo - Allow all uploads"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Demo - Allow all updates"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

CREATE POLICY "Demo - Allow all deletes"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');
*/
