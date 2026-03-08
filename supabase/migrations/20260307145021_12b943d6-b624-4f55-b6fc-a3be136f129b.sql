
-- Add destaque (thumbs up) column to amistoso_convocacoes
ALTER TABLE public.amistoso_convocacoes ADD COLUMN IF NOT EXISTS destaque boolean NOT NULL DEFAULT false;

-- Add observacoes_resultado to eventos_esportivos for post-match notes
ALTER TABLE public.eventos_esportivos ADD COLUMN IF NOT EXISTS observacoes_resultado text;
