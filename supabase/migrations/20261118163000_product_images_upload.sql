-- L&A Store Royal: gallery URLs and restricted product image uploads.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT ARRAY[]::text[];
UPDATE public.products SET images = ARRAY[image] WHERE image IS NOT NULL AND image <> '' AND cardinality(images) = 0;
CREATE INDEX IF NOT EXISTS royal_products_gallery_active_idx ON public.products (active) WHERE active = true;
-- Existing bucket: product-images is public, accepts JPEG, PNG, WebP and limits uploads to 5 MB.
DROP POLICY IF EXISTS royal_product_photos_public_read ON storage.objects;
CREATE POLICY royal_product_photos_public_read ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
DROP POLICY IF EXISTS royal_product_photos_admin_upload ON storage.objects;
CREATE POLICY royal_product_photos_admin_upload ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND (storage.foldername(name))[1] = 'catalog'
 AND (select auth.uid()) IS NOT NULL AND (select public.is_admin()));
