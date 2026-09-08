-- Comprovante PIX anexado pela cooperativa na liquidação do mercado

alter table public.hb_credit_settlements
  add column if not exists comprovante_storage_path text;
