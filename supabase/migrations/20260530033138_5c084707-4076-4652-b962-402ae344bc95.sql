
CREATE OR REPLACE FUNCTION public.get_push_monitor_escola(p_escolinha_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admins podem acessar o monitor de push';
  END IF;

  WITH
  pais AS (
    SELECT DISTINCT r.id AS responsavel_id, r.nome, r.telefone, r.user_id
    FROM crianca_escolinha ce
    JOIN crianca_responsavel cr ON cr.crianca_id = ce.crianca_id
    JOIN responsaveis r ON r.id = cr.responsavel_id
    WHERE ce.escolinha_id = p_escolinha_id AND ce.ativo = true AND r.user_id IS NOT NULL
  ),
  pais_push AS (
    SELECT p.*, EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = p.user_id) AS has_push
    FROM pais p
  ),
  profs AS (
    SELECT pr.user_id
    FROM professores pr
    WHERE pr.escolinha_id = p_escolinha_id AND pr.ativo = true AND pr.user_id IS NOT NULL
  ),
  admins AS (
    SELECT e.admin_user_id AS user_id
    FROM escolinhas e
    WHERE e.id = p_escolinha_id AND e.admin_user_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'escolinha', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome) FROM escolinhas e WHERE e.id = p_escolinha_id),
    'cobertura', jsonb_build_object(
      'pais_total', (SELECT COUNT(*) FROM pais_push),
      'pais_com_push', (SELECT COUNT(*) FROM pais_push WHERE has_push),
      'professores_total', (SELECT COUNT(*) FROM profs),
      'professores_com_push', (SELECT COUNT(*) FROM profs p WHERE EXISTS(SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = p.user_id)),
      'admins_total', (SELECT COUNT(*) FROM admins),
      'admins_devices', (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id IN (SELECT user_id FROM admins)),
      'envios_30d', (SELECT COUNT(*) FROM push_notifications_log WHERE escolinha_id = p_escolinha_id AND enviado_em > now() - interval '30 days')
    ),
    'envios_por_tipo', COALESCE((
      SELECT jsonb_agg(t ORDER BY (t->>'total')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'tipo', tipo,
          'total', COUNT(*),
          'entregues', COUNT(*) FILTER (WHERE entregue),
          'ultimo', MAX(enviado_em)
        ) AS t
        FROM push_notifications_log
        WHERE escolinha_id = p_escolinha_id AND enviado_em > now() - interval '30 days'
        GROUP BY tipo
      ) s
    ), '[]'::jsonb),
    'pais_sem_push', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'responsavel_id', pp.responsavel_id,
        'nome', pp.nome,
        'telefone', pp.telefone,
        'filhos', COALESCE((
          SELECT jsonb_agg(c.nome ORDER BY c.nome)
          FROM crianca_responsavel cr
          JOIN criancas c ON c.id = cr.crianca_id
          JOIN crianca_escolinha ce ON ce.crianca_id = c.id AND ce.escolinha_id = p_escolinha_id AND ce.ativo = true
          WHERE cr.responsavel_id = pp.responsavel_id
        ), '[]'::jsonb)
      ) ORDER BY pp.nome)
      FROM pais_push pp WHERE NOT pp.has_push
    ), '[]'::jsonb),
    'historico', COALESCE((
      SELECT jsonb_agg(h ORDER BY (h->>'enviado_em') DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', l.id,
          'enviado_em', l.enviado_em,
          'tipo', l.tipo,
          'titulo', l.titulo,
          'mensagem', l.mensagem,
          'entregue', l.entregue,
          'user_id', l.user_id,
          'destinatario', COALESCE(
            (SELECT r.nome FROM responsaveis r WHERE r.user_id = l.user_id LIMIT 1),
            (SELECT pr.nome FROM professores pr WHERE pr.user_id = l.user_id LIMIT 1),
            (SELECT 'Admin: ' || e.nome FROM escolinhas e WHERE e.admin_user_id = l.user_id LIMIT 1),
            '—'
          )
        ) AS h
        FROM push_notifications_log l
        WHERE l.escolinha_id = p_escolinha_id
        ORDER BY l.enviado_em DESC
        LIMIT 50
      ) s
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_push_monitor_escola(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_escolas_para_admin()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.nome FROM escolinhas e
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY e.nome;
$$;

GRANT EXECUTE ON FUNCTION public.list_escolas_para_admin() TO authenticated;
