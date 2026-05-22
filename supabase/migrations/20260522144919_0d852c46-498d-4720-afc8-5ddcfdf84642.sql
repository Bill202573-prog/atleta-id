CREATE OR REPLACE FUNCTION public.can_view_banner(_banner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.banners_publicitarios b
    WHERE b.id = _banner_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR (
          b.ativo = true
          AND (b.inicio_em IS NULL OR b.inicio_em <= now())
          AND (b.fim_em IS NULL OR b.fim_em >= now())
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.banner_escolas be
              WHERE be.banner_id = b.id
            )
            OR EXISTS (
              SELECT 1
              FROM public.banner_escolas be
              WHERE be.banner_id = b.id
                AND public.guardian_can_access_escolinha(be.escolinha_id)
            )
          )
        )
      )
  );
$function$;

DROP POLICY IF EXISTS "Banners visíveis para usuários autorizados" ON public.banners_publicitarios;

CREATE POLICY "Banners visíveis para usuários autorizados"
ON public.banners_publicitarios
FOR SELECT
TO authenticated
USING (public.can_view_banner(id));