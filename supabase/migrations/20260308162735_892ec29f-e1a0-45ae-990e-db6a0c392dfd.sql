
-- Create missing buckets with correct names
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('atleta-fotos', 'atleta-fotos', true),
  ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for atleta-fotos
CREATE POLICY "Public read atleta-fotos"
ON storage.objects FOR SELECT
USING (bucket_id = 'atleta-fotos');

CREATE POLICY "Auth upload atleta-fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'atleta-fotos');

-- RLS for product-photos
CREATE POLICY "Public read product-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-photos');

CREATE POLICY "Auth upload product-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-photos');
