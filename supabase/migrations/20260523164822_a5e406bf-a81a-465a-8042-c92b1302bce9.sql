CREATE OR REPLACE FUNCTION public.get_resumo_mensal_atleta(p_crianca_id uuid, p_ano integer, p_mes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_guardian boolean;
  v_data_inicio date;
  v_data_fim date;
  v_crianca jsonb;
  v_escola jsonb;
  v_escolinha_id uuid;
  v_aulas_total integer := 0;
  v_aulas_presentes integer := 0;
  v_amistosos integer := 0;
  v_campeonatos integer := 0;
  v_jogos integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM crianca_responsavel cr
    JOIN responsaveis r ON r.id = cr.responsavel_id
    WHERE cr.crianca_id = p_crianca_id
      AND r.user_id = v_uid
  ) INTO v_is_guardian;

  IF NOT v_is_guardian AND NOT has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF NOT is_crianca_resumo_mensal_enabled(p_crianca_id) THEN
    RAISE EXCEPTION 'Recurso indisponível para esta escola';
  END IF;

  v_data_inicio := make_date(p_ano, p_mes, 1);
  v_data_fim := (v_data_inicio + INTERVAL '1 month - 1 day')::date;

  SELECT jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'foto_url', c.foto_url
  ) INTO v_crianca
  FROM criancas c WHERE c.id = p_crianca_id;

  -- Escolinha ativa da criança (preferindo uma que esteja habilitada para o resumo).
  SELECT ce.escolinha_id
    INTO v_escolinha_id
  FROM crianca_escolinha ce
  WHERE ce.crianca_id = p_crianca_id
    AND ce.ativo = true
  ORDER BY
    (EXISTS (SELECT 1 FROM resumo_mensal_escolas_habilitadas r WHERE r.escolinha_id = ce.escolinha_id)) DESC,
    ce.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT jsonb_build_object(
    'id', e.id,
    'nome', e.nome,
    'logo_url', e.logo_url
  ) INTO v_escola
  FROM escolinhas e
  WHERE e.id = v_escolinha_id;

  SELECT COUNT(DISTINCT a.id) INTO v_aulas_total
  FROM aulas a
  JOIN crianca_turma ct ON ct.turma_id = a.turma_id
  WHERE ct.crianca_id = p_crianca_id
    AND a.data BETWEEN v_data_inicio AND v_data_fim
    AND COALESCE(a.status::text, 'realizada') NOT IN ('cancelada');

  SELECT COUNT(*) INTO v_aulas_presentes
  FROM presencas p
  JOIN aulas a ON a.id = p.aula_id
  WHERE p.crianca_id = p_crianca_id
    AND p.presente = true
    AND a.data BETWEEN v_data_inicio AND v_data_fim;

  SELECT COUNT(DISTINCT ac.evento_id) INTO v_amistosos
  FROM amistoso_convocacoes ac
  JOIN eventos_esportivos ee ON ee.id = ac.evento_id
  WHERE ac.crianca_id = p_crianca_id
    AND ee.data BETWEEN v_data_inicio AND v_data_fim;

  SELECT COUNT(DISTINCT cc.campeonato_id) INTO v_campeonatos
  FROM campeonato_convocacoes cc
  WHERE cc.crianca_id = p_crianca_id
    AND EXISTS (
      SELECT 1 FROM eventos_esportivos ee
      WHERE ee.campeonato_id = cc.campeonato_id
        AND ee.data BETWEEN v_data_inicio AND v_data_fim
    );

  v_jogos := v_amistosos + COALESCE((
    SELECT COUNT(DISTINCT ee.id)
    FROM eventos_esportivos ee
    JOIN campeonato_convocacoes cc ON cc.campeonato_id = ee.campeonato_id
    WHERE cc.crianca_id = p_crianca_id
      AND ee.data BETWEEN v_data_inicio AND v_data_fim
  ), 0);

  RETURN jsonb_build_object(
    'crianca', v_crianca,
    'escola', v_escola,
    'ano', p_ano,
    'mes', p_mes,
    'presenca', jsonb_build_object(
      'aulas_total', v_aulas_total,
      'aulas_presentes', v_aulas_presentes,
      'percentual', CASE WHEN v_aulas_total > 0 
        THEN ROUND((v_aulas_presentes::numeric / v_aulas_total) * 100)
        ELSE 0 END
    ),
    'participacoes', jsonb_build_object(
      'amistosos', v_amistosos,
      'campeonatos', v_campeonatos,
      'jogos', v_jogos
    )
  );
END;
$function$;