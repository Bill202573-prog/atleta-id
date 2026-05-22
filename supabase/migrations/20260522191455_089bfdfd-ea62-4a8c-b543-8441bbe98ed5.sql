
DROP POLICY IF EXISTS "Admins veem envios" ON public.resumo_mensal_envios;

CREATE TABLE IF NOT EXISTS public.resumo_mensal_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crianca_id uuid NOT NULL,
  ano integer NOT NULL,
  mes integer NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crianca_id, ano, mes)
);

ALTER TABLE public.resumo_mensal_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem envios"
ON public.resumo_mensal_envios
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_resumo_mensal_envios_lookup
ON public.resumo_mensal_envios (crianca_id, ano, mes);
