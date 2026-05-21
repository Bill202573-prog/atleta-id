ALTER TABLE public.banners_publicitarios
  ADD COLUMN IF NOT EXISTS posicao text NOT NULL DEFAULT 'topo',
  ADD COLUMN IF NOT EXISTS slides jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.banners_publicitarios
  DROP CONSTRAINT IF EXISTS banners_publicitarios_posicao_check;
ALTER TABLE public.banners_publicitarios
  ADD CONSTRAINT banners_publicitarios_posicao_check
  CHECK (posicao IN ('topo','produtos'));

ALTER TABLE public.banners_publicitarios
  DROP CONSTRAINT IF EXISTS banners_publicitarios_slides_max5;
ALTER TABLE public.banners_publicitarios
  ADD CONSTRAINT banners_publicitarios_slides_max5
  CHECK (jsonb_typeof(slides) = 'array' AND jsonb_array_length(slides) <= 5);

-- Backfill: para cada banner sem slides, criar 1 slide a partir das colunas atuais
UPDATE public.banners_publicitarios
SET slides = jsonb_build_array(
  jsonb_build_object(
    'imagem_url', imagem_url,
    'link_url', link_url,
    'abrir_nova_aba', abrir_nova_aba
  )
)
WHERE jsonb_array_length(slides) = 0
  AND imagem_url IS NOT NULL;