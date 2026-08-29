-- Cobrança SaaS HB na nuvem — enforcement server-side (Fase 1)
alter table public.cooperativas
  add column if not exists cobranca_saas jsonb;

comment on column public.cooperativas.cobranca_saas is
  'Status de assinatura HB (bloqueio inadimplência) — fonte da verdade para APIs.';
