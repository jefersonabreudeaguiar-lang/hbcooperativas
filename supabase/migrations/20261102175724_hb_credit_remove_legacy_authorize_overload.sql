-- A assinatura atual tem cashback opcional e atende chamadas com 9 ou 10 argumentos.
-- Remove somente a rotina antiga, sem CASCADE e sem alterar dados.
drop function if exists public.hb_credit_authorize_payment(text,text,text,text,text,text,text,text,text);
