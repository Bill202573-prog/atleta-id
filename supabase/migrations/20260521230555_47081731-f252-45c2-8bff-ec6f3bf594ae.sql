
ALTER TABLE public.banners_publicitarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner_escolas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_banner(_banner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.banners_publicitarios b
    WHERE b.id = _banner_id
      AND b.ativo = true
      AND (b.inicio_em IS NULL OR b.inicio_em <= now())
      AND (b.fim_em IS NULL OR b.fim_em >= now())
      AND (
        NOT EXISTS (SELECT 1 FROM public.banner_escolas be WHERE be.banner_id = b.id)
        OR EXISTS (
          SELECT 1 FROM public.banner_escolas be
          WHERE be.banner_id = b.id
            AND public.guardian_can_access_escolinha(be.escolinha_id)
        )
        OR public.has_role(auth.uid(), 'admin')
      )
  );
$$;

DROP POLICY IF EXISTS "Banners visíveis para usuários autorizados" ON public.banners_publicitarios;
CREATE POLICY "Banners visíveis para usuários autorizados"
ON public.banners_publicitarios FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    ativo = true
    AND (inicio_em IS NULL OR inicio_em <= now())
    AND (fim_em IS NULL OR fim_em >= now())
    AND (
      NOT EXISTS (SELECT 1 FROM public.banner_escolas be WHERE be.banner_id = banners_publicitarios.id)
      OR EXISTS (
        SELECT 1 FROM public.banner_escolas be
        WHERE be.banner_id = banners_publicitarios.id
          AND public.guardian_can_access_escolinha(be.escolinha_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "Admins gerenciam banners (insert)" ON public.banners_publicitarios;
CREATE POLICY "Admins gerenciam banners (insert)"
ON public.banners_publicitarios FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins gerenciam banners (update)" ON public.banners_publicitarios;
CREATE POLICY "Admins gerenciam banners (update)"
ON public.banners_publicitarios FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins gerenciam banners (delete)" ON public.banners_publicitarios;
CREATE POLICY "Admins gerenciam banners (delete)"
ON public.banners_publicitarios FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Segmentação visível com o banner" ON public.banner_escolas;
CREATE POLICY "Segmentação visível com o banner"
ON public.banner_escolas FOR SELECT
TO authenticated
USING (public.can_view_banner(banner_id));

DROP POLICY IF EXISTS "Admins gerenciam segmentação (insert)" ON public.banner_escolas;
CREATE POLICY "Admins gerenciam segmentação (insert)"
ON public.banner_escolas FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins gerenciam segmentação (delete)" ON public.banner_escolas;
CREATE POLICY "Admins gerenciam segmentação (delete)"
ON public.banner_escolas FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('banners-publicitarios', 'banners-publicitarios', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Leitura pública dos banners" ON storage.objects;
CREATE POLICY "Leitura pública dos banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners-publicitarios');

DROP POLICY IF EXISTS "Admins fazem upload de banners" ON storage.objects;
CREATE POLICY "Admins fazem upload de banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'banners-publicitarios' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins atualizam banners" ON storage.objects;
CREATE POLICY "Admins atualizam banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'banners-publicitarios' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins excluem banners" ON storage.objects;
CREATE POLICY "Admins excluem banners"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'banners-publicitarios' AND public.has_role(auth.uid(), 'admin'));
