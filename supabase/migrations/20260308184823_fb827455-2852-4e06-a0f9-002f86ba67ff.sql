-- Rename abacatepay columns in mensalidades
ALTER TABLE public.mensalidades RENAME COLUMN abacatepay_billing_id TO asaas_payment_id;
ALTER TABLE public.mensalidades RENAME COLUMN abacatepay_url TO asaas_pix_url;

-- Rename abacatepay columns in historico_cobrancas
ALTER TABLE public.historico_cobrancas RENAME COLUMN abacatepay_billing_id TO asaas_payment_id;
ALTER TABLE public.historico_cobrancas RENAME COLUMN abacatepay_url TO asaas_pix_url;