
INSERT INTO public.resumo_mensal_escolas_habilitadas (escolinha_id)
VALUES ('1717c373-f039-4179-9839-b749abf0b882'::uuid)
ON CONFLICT (escolinha_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_crianca_resumo_mensal_enabled(p_crianca_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM crianca_escolinha ce
    JOIN resumo_mensal_escolas_habilitadas h ON h.escolinha_id = ce.escolinha_id
    WHERE ce.crianca_id = p_crianca_id
  );
$function$;
