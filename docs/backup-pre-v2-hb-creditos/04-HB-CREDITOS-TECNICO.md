# HB Créditos — referência técnica (backup)

## Camadas

| Camada | Local |
|--------|--------|
| Domínio / serviços | `src/modules/hb-credit/` |
| API HTTP | `src/app/api/credit/**` |
| Persistência | `src/lib/supabase/contaCoopStorage.ts` |
| Cliente HTTP | `src/services/creditApiService.ts` |
| UI cooperado | `src/app/(app)/minha-conta-coop/**`, `src/components/hb-credit/**` |
| UI responsável | `src/app/(app)/conta-coop/ContaCoopContent.tsx` |
| Helpers | `src/lib/hb-credit/**` |

## APIs (`/api/credit`)

| Rota | Uso |
|------|-----|
| `account` | Conta cooperado (limite usado/liberado) |
| `limites` | Painel limites responsável |
| `authorize` | Autorizar pagamento PIN |
| `payment-intents` | Intenções de pagamento |
| `cooperado-receber` | Recebíveis cooperado |
| `mercado` | Painel parceiro |
| `parceiros` | Cadastro mercados |
| `credito-base` | Base de cálculo limite |
| `sync-limite` | Sync após pagamento operacional |
| `dashboard` | KPIs staff |
| `settlements` | Liquidação |
| `refund-requests` | Estornos |
| `fiscal-notes` | NF mercado |
| `status` | Feature flags / saúde |
| `utilizacao-resumo` | Resumos |

Admin: `/api/admin/conta-coop-overview`, `apply-hb-credit-refund-fix`.

## Postgres (conceitual)

Tabelas `hb_credit_*` (contas, transações, limites, parceiros, idempotência). Migrations em `supabase/migrations` (buscar `hb_credit`).

Projeção legado: `arquivosMensais.contaCoopDescontos` no operacional JSON.

## Crédito base (limite %)

- Engine: `creditBaseAuthoritative.ts`, `creditBaseFromFicha.ts`, `projetarAppDataFinanceiroParaCreditoBase.ts`.
- Guard: `creditBaseHbGuard.ts`.
- **V2:** entrada manual substitui projeção automática quando preenchida.

## Pagamento (M6)

- `paymentAffordability.ts`, `PaymentAuthorizationService.ts`.
- PIN: `FINANCIAL_PIN_MIN_LENGTH` em `modules/hb-credit/config.ts`.

## Eventos cliente

- `notifyHbCreditAccountCacheUpdated`, poll revision em bootstrap.
- Cache key: `hb.coop.hbCreditAccount.v5:{cnpj}:{cooperadoId}`.

## Integração ficha / notas (legado)

- `HistoricoHbCreditosResumo` na ficha.
- `notaPedidoService` — valor líquido com abatimento HB.
- Cron: `/api/cron/operacional-hb-descontos-repair`.

**Ao cortar notas/ficha na V2:** manter APIs HB; desligar apenas projeção automática de crédito base se valor manual existir.

## Testes de contrato úteis

- `scripts/test-bic-etapa3-projecao-credito-base.ts`
- Testes em `modules/hb-credit` (se houver)
- Homolog manual: pagar QR + ver limite responsável
