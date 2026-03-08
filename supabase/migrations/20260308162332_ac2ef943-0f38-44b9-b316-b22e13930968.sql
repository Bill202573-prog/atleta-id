
-- Create storage buckets for migrated files
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('child-photos', 'child-photos', false),
  ('atividade-externa-fotos', 'atividade-externa-fotos', false),
  ('escolinha-logos', 'escolinha-logos', true),
  ('professor-photos', 'professor-photos', true),
  ('produto-photos', 'produto-photos', true),
  ('atleta-photos', 'atleta-photos', true),
  ('escola-posts', 'escola-posts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for child-photos (private)
CREATE POLICY "Guardians can view child photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'child-photos'
  AND (
    EXISTS (
      SELECT 1 FROM crianca_responsavel cr
      JOIN responsaveis r ON r.id = cr.responsavel_id
      WHERE r.user_id = auth.uid()
      AND cr.crianca_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM crianca_escolinha ce
      JOIN escolinhas e ON e.id = ce.escolinha_id
      WHERE e.admin_user_id = auth.uid()
      AND ce.crianca_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM crianca_turma ct
      JOIN turmas t ON t.id = ct.turma_id
      JOIN professores p ON p.id = t.professor_id
      WHERE p.user_id = auth.uid()
      AND ct.crianca_id::text = (storage.foldername(name))[1]
    )
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Guardians and admins can upload child photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'child-photos'
  AND (
    EXISTS (
      SELECT 1 FROM crianca_responsavel cr
      JOIN responsaveis r ON r.id = cr.responsavel_id
      WHERE r.user_id = auth.uid()
      AND cr.crianca_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM crianca_escolinha ce
      JOIN escolinhas e ON e.id = ce.escolinha_id
      WHERE e.admin_user_id = auth.uid()
      AND ce.crianca_id::text = (storage.foldername(name))[1]
    )
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- RLS for atividade-externa-fotos (private)
CREATE POLICY "Users can view atividade fotos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'atividade-externa-fotos');

CREATE POLICY "Users can upload atividade fotos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'atividade-externa-fotos');

-- RLS for public buckets (anyone can read, authenticated can upload)
CREATE POLICY "Public read escolinha-logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'escolinha-logos');

CREATE POLICY "Admins upload escolinha-logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'escolinha-logos');

CREATE POLICY "Public read professor-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'professor-photos');

CREATE POLICY "Auth upload professor-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'professor-photos');

CREATE POLICY "Public read produto-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'produto-photos');

CREATE POLICY "Auth upload produto-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'produto-photos');

CREATE POLICY "Public read atleta-photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'atleta-photos');

CREATE POLICY "Auth upload atleta-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'atleta-photos');

CREATE POLICY "Public read escola-posts"
ON storage.objects FOR SELECT
USING (bucket_id = 'escola-posts');

CREATE POLICY "Auth upload escola-posts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'escola-posts');
