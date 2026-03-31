
-- Table to track when guardians view convocations
CREATE TABLE public.convocacao_visualizacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocacao_id UUID NOT NULL REFERENCES public.amistoso_convocacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  visualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (convocacao_id, user_id)
);

ALTER TABLE public.convocacao_visualizacoes ENABLE ROW LEVEL SECURITY;

-- Guardians can insert their own visualizations
CREATE POLICY "Guardians can insert own visualizacoes"
  ON public.convocacao_visualizacoes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Guardians can see their own visualizations
CREATE POLICY "Guardians can view own visualizacoes"
  ON public.convocacao_visualizacoes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- School admins can view visualizations for their school's convocations
CREATE POLICY "School admins can view convocacao visualizacoes"
  ON public.convocacao_visualizacoes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM amistoso_convocacoes ac
      JOIN eventos_esportivos ee ON ee.id = ac.evento_id
      JOIN escolinhas e ON e.id = ee.escolinha_id
      WHERE ac.id = convocacao_id
        AND e.admin_user_id = auth.uid()
    )
  );

-- Add daily pending convocation push config column
ALTER TABLE public.escola_push_config 
  ADD COLUMN IF NOT EXISTS convocacao_pendente_diario BOOLEAN NOT NULL DEFAULT true;
