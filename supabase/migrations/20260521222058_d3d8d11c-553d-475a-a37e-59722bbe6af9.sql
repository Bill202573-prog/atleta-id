ALTER TABLE public.escola_cadastro_bancario
  ADD COLUMN IF NOT EXISTS multa_percentual numeric(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS juros_mes_percentual numeric(5,2) NOT NULL DEFAULT 1.00;

UPDATE public.escola_cadastro_bancario
SET multa_percentual = COALESCE(multa_percentual, 2.00),
    juros_mes_percentual = COALESCE(juros_mes_percentual, 1.00)
WHERE multa_percentual IS NULL OR juros_mes_percentual IS NULL;

ALTER TABLE public.mensalidades
  ADD COLUMN IF NOT EXISTS valor_pago numeric(10,2);