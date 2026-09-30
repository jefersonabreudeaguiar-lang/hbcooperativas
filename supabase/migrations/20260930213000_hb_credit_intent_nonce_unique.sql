-- QR HB: nonce único por cooperativa (reforço além de intent id + secret nonce no QR).

create unique index if not exists hb_credit_payment_intents_coop_nonce_uidx
  on public.hb_credit_payment_intents (cooperative_cnpj, nonce);
