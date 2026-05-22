
CREATE OR REPLACE FUNCTION public.debug_banners_for_user(p_email text)
RETURNS TABLE(
  banner_id uuid,
  titulo text,
  posicao text,
  ativo boolean,
  inicio_em timestamptz,
  fim_em timestamptz,
  segmentado_para text[],
  user_escolas text[],
  visivel_para_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admins podem usar este diagnóstico';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário com email % não encontrado', p_email;
  END IF;

  RETURN QUERY
  WITH user_escolas_cte AS (
    SELECT DISTINCT ce.escolinha_id
    FROM responsaveis r
    JOIN crianca_responsavel cr ON cr.responsavel_id = r.id
    JOIN crianca_escolinha ce ON ce.crianca_id = cr.crianca_id
    WHERE r.user_id = v_uid
  )
  SELECT
    b.id,
    b.titulo,
    b.posicao,
    b.ativo,
    b.inicio_em,
    b.fim_em,
    COALESCE(ARRAY(
      SELECT e.nome FROM banner_escolas be
      JOIN escolinhas e ON e.id = be.escolinha_id
      WHERE be.banner_id = b.id
      ORDER BY e.nome
    ), ARRAY[]::text[]) AS segmentado_para,
    COALESCE(ARRAY(
      SELECT e.nome FROM user_escolas_cte ue
      JOIN escolinhas e ON e.id = ue.escolinha_id
      ORDER BY e.nome
    ), ARRAY[]::text[]) AS user_escolas,
    (
      b.ativo = true
      AND (b.inicio_em IS NULL OR b.inicio_em <= now())
      AND (b.fim_em IS NULL OR b.fim_em >= now())
      AND (
        NOT EXISTS (SELECT 1 FROM banner_escolas be WHERE be.banner_id = b.id)
        OR EXISTS (
          SELECT 1 FROM banner_escolas be
          WHERE be.banner_id = b.id
            AND be.escolinha_id IN (SELECT escolinha_id FROM user_escolas_cte)
        )
      )
    ) AS visivel_para_user
  FROM banners_publicitarios b
  ORDER BY b.created_at DESC;
END;
$$;
