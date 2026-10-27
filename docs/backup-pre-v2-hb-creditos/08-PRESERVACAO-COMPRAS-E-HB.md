# Preservação — compras nos mercados e HB Créditos (V2)

## Compromisso

A Fase 1 (menus + redirects) **não** apaga, migra nem reescreve dados. Compras nos mercados parceiros e todo o HB Créditos que funciona hoje **permanecem na nuvem e nas APIs**.

## Onde ficam as compras (mercados)

| Camada | O que guarda |
|--------|----------------|
| **Postgres (Supabase)** | `hb_credit_transactions` (pagamento autorizado, recibo, idempotência), `hb_credit_payment_intents`, `hb_credit_ledger_entries` / extrato, vínculo `hb_credit_partners` |
| **RPC** | `hb_credit_authorize_payment` — grava transação + ledger (sem tocar ficha corrida) |
| **API** | `src/app/api/credit/**` — mesmos contratos |
| **Cliente** | `contaCoopStorage.ts`, `syncContaCoopFichaDescontos.ts` — overlay local de descontos/compras para extrato e “a receber” |

Estornos, QR, PIN, painel `/mercado-parceiro` e histórico do cooperado em `/minha-conta-coop` leem **essas** tabelas e serviços.

## O que a V2 Fase 1 muda (só UI)

- Flag `NEXT_PUBLIC_V2_HB_ONLY=1`: menus enxutos, home cooperado → `/minha-conta-coop`, responsável → `/conta-coop`.
- Rotas legadas (`/notas-pedido`, etc.) podem ainda existir no código; **não** são removidas nesta fase.

## O que NÃO fazer sem backup + homologação

- `DROP` / `TRUNCATE` em `hb_credit_*`
- Scripts de wipe operacional em produção
- Remover `src/app/api/credit` ou `modules/hb-credit`

## Fase 2 (valor bruto manual)

Só **adiciona** fonte de crédito base (campo manual); não apaga transações nem ledger existente.

## Checklist antes de ligar a flag em produção

1. Tag `backup/pre-v2-full-app` no commit anterior à slim UI.
2. Export Supabase: amostra `hb_credit_transactions` + `hb_credit_accounts` (cooperativa piloto).
3. Teste: cooperado vê extrato com compras antigas; mercado confirma cobrança QR; responsável vê painel `/conta-coop`.
