ALTER TABLE public.escola_push_config
  ADD COLUMN IF NOT EXISTS aniversario_admin_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comunicado_admin_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS presenca_confirmada_admin_push boolean NOT NULL DEFAULT true;