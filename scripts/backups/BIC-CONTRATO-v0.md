# BIC-CONTRATO-v0

**Fase:** B0 — inventário e contrato (somente documentação)  
**Data:** 2026-09-27  
**Backup de referência:** `backups/POSBIC_2026-09-27_01-53-47` (tag git `POSBIC` → commit `20d9dea`)  
**Status:** A BIC **não está implantada**. Este documento define vocabulário e regras futuras.

---

## A) O que é a BIC

A **Base de Informação Central (BIC)** é o **modelo lógico** de ledger cooperativo **por cooperado**: créditos de entregas conferidas, débitos (mensalidade, HB Conta Coop, avulsos), pagamentos registrados e confirmações/assinaturas, com **saldo “a receber”** derivado por **regras únicas**.

Na implantação progressiva acordada:

- A BIC começa como **camada de leitura/projeção** sobre os dados **já existentes** (`AppData` local + réplica `operacional.json` + `notas_pedido` + HB Postgres).
- A BIC **não substitui** overnight nenhuma store física.

---

## B) O que NÃO é a BIC

- Não é um segundo banco paralelo com autoridade própria (no B1).
- Não é permissão para migrar, apagar ou “corrigir silenciosamente” históricos.
- Não é renomear pastas no código sem unificar leitura.
- Não é unificar HB Crédito com “quanto vou receber” na fase B1.
- Não é event-sourcing completo (opcional apenas em B4).

---

## C) Dados que devem ser preservados (integridade)

Durante toda a implantação BIC, **nenhuma** informação listada abaixo pode ser perdida, apagada ou sobrescrita sem trilha explícita de auditoria/estorno:

Cooperados, cooperativas, `app_users`, `notas_pedido`, entregas/fotos, conferências, `fichaCorrida`, `pagamentosCooperado`, recibos, assinaturas, valores confirmados e aguardando, `arquivosMensais`, HB Crédito (contas, intents, transações, ledger, receivables, allocations, settlements, fiscal notes), mercados/parceiros, contratos/cronogramas, livro caixa, mensalidades, descontos, valores avulsos, votações, prestações, snapshots de fechamento, auditoria (`security_audit_log`, `cooperative_audit_log`, `hb_credit_audit_log`), Storage (`hb-cooperativa-sync`, `hb-cooperados`, `hb-entregas`), metadados de sync (`syncMeta`, chaves operacional authoritative), timestamps e IDs de relacionamento (`fichaIds`, `notaPedidoIds` em pagamentos).

---

## D) Eventos existentes hoje (vocabulário operacional)

| Evento lógico | Onde aparece | Efeito principal |
|---------------|--------------|------------------|
| Entrega enviada (foto) | `notas_pedido` + Storage fotos | Nota aguarda conferência |
| Conferência / lançamento | `NotasPedidoContent` → `rebuildFichasNota` | Gera/atualiza `fichaCorrida` pendente |
| Ajuste ficha mês | `ajustesFichaMes` | Altera composição do resumo |
| Registro PIX (responsável) | `registrarPagamentoCooperado` + API `registrar-pagamento` | `pagamentosCooperado`: `aguardando_confirmacao`; marca fichas `pago` (escopo) |
| Assinatura recibo (cooperado) | `confirmarPagamentoCooperado` + API `confirmar-pagamento` | `status: confirmado`; assinatura persistida |
| Verificação recibo (responsável) | `marcarReciboPagamentoVerificadoResponsavel` | Metadado de verificação |
| Arquivo mensal | `arquivosMensais` | Snapshot/impressão histórica |
| Push operacional | `pushOperacionalToCloud` | Escreve `operacional.json` |
| Pull operacional | `mergeOperacionalIntoData` | Mescla nuvem → local |
| Pagamento HB (consumo) | RPC `hb_credit_authorize_payment` + ledger | Débito HB; desconto na ficha via `contaCoopDescontos` |
| Estorno/refund HB | RPC refund / refund_requests | Reversão parcial HB |
| Nota excluída / reset operacional | `fullReset`, guards | Pode limpar fatias operacionais (alto risco) |

---

## E) Sistemas que participam hoje

| Sistema | Papel |
|---------|--------|
| Browser `localStorage` (`coopeagriplla_data`) | Cópia de trabalho `AppData` |
| Supabase Postgres | Notas, usuários, HB, auditoria |
| Supabase Storage `operacional.json` | Réplica operacional autoritativa (gestão push) |
| Supabase Storage notas/fotos | `notas_pedido` rows + blobs entrega |
| API Next.js (`/api/*`) | Auth, notas, sync, credit, cron |
| Motor local `notaPedidoService` | Cálculo ficha/pagamento |
| Motor sync `cooperativaSyncCloudService` | Pull/merge/push |
| Módulo `hb-credit` + `contaCoopStorage` | Ledger HB server-side |

---

## F) Quem escreve (autoridade de escrita atual)

| Domínio | Escritores principais |
|---------|-------------------------|
| `notas_pedido` | Cooperado (API POST/PATCH), responsável (conferência UI) |
| `fichaCorrida` | Conferência (`rebuildFichasNota`), pagamento (`marcarFichaComoPaga`), sync merge, reconciliação |
| `pagamentosCooperado` | Responsável local+nuvem registro; cooperado confirma; merge sync |
| `operacional.json` | Push gestão; rotas dedicadas pagamento; cron repair HB descontos |
| HB ledger | RPC authorize/refund/settlement (servidor) |
| Cooperados cadastro | API cooperados + Storage `hb-cooperados` |

**Autoridade de negócio percebida:** responsável na gestão (push operacional); cooperado confirma recebimento; HB servidor para crédito consumido.

---

## G) Quem somente lê (ou leitura predominante)

| Consumidor | Fonte usual |
|------------|-------------|
| Cooperado Início / Quanto vou receber | `AppData` local pós-sync + `getValorQuantoVouReceber` |
| Relatórios gestão | `getTotalAPagarCooperado`, `relatorioService` |
| HB cooperado (utilização) | API `/api/credit/*` (Postgres) |
| Crédito-base autoritativo | `creditBaseAuthoritative` (operacional + notas nuvem) |
| Contador | Snapshots, pareceres, dossie |

---

## H) Dados financeiros (classificação)

- **Ledger cooperativo (core BIC futuro):** `fichaCorrida`, `pagamentosCooperado`, `arquivosMensais`, `ajustesFichaMes`, `mensalidades`, `descontos`, `valoresAvulsosReceber`, `contaCoopDescontos` (memória/arquivo mensal).
- **Pré-financeiro:** `notas_pedido`, fotos, status conferência.
- **HB (domínio separado até B3):** `hb_credit_*` tables, allocations, receivables.
- **Tesouraria cooperativa:** `livroCaixa`, `pagamentos` (legado financeiro coop), fechamentos.

---

## I) Dados operacionais (não saldo BIC)

Comunicados, reclamações, votações, veículos, propriedades, contratos instituição (preço), entregas logísticas puras.

---

## J) Dados que são apenas projeção (UI / relatório)

- `getValorQuantoVouReceber`, `getResumoQuantoVouReceberCooperado`
- `getValorExibicaoCooperado`, `getResumoExibicaoCooperadoPilot`
- Totais dashboard gestão (`dashboardService`)
- Pré-visualizações HB (`credito-base`, charge preview)

Projeções **não** devem persistir resultado como nova verdade no B1.

---

## K) Regras de imutabilidade (alvo contratual)

1. Pagamento `confirmado` com assinatura: **não editar** valor/escopo; correção = novo lançamento ou estorno documentado.
2. Recibo congelado: registro `aguardando_confirmacao` guarda `valorLiquido` e ids no momento do PIX.
3. Histórico de notas conferidas: não apagar silenciosamente (exclusões via refs auditadas).

---

## L) Regras de auditoria

- `addAuditEntry` local + `cooperative_audit_log` / `security_audit_log` cloud.
- HB: `hb_credit_audit_log`, idempotency records.
- Merge operacional: guards `pagamentoIntegridadeService`, `fichaCorridaPagamentoGuard`.

---

## M) Regras para estorno

- HB: fluxos refund / refund_requests (RPC).
- Cooperativo: preferir **novo crédito** ou **ajuste explícito** — não reabrir pagamento confirmado sem política B2+.

---

## N) Regras para pagamentos confirmados

- Mês com `confirmado` e sem fichas complementares pendentes → saldo líquido **0** (`getResumoValorAPagarRelatorio`).
- `aguardando` supersedido por `confirmado` no mesmo mês → não exibir recibo stale (`pagamentoAguardandoSupersedidoPorConfirmado`).

---

## O) Regras para dados antigos

- Legado sem `fichaIds`/`notaPedidoIds`: pagamento cobre **mês inteiro** (caminho ainda ativo).
- Arquivos mensais: preservar para impressão; não recalcular retroativamente sem política explícita.

---

## P) Regras para múltiplos meses

- `getTotalAPagarCooperado` sem mês: soma `mesesReferenciaComDebitoAberto`.
- `getValorQuantoVouReceber`: consolidação multi-mês quando há assinatura pendente em um mês e débito em outro.

---

## Q) Regras para múltiplas notas

- Ficha pode ser 1:N por nota (`buildFichasDivisaoFromNota`).
- Pagamento parcial: escopo via `fichaIds`/`notaPedidoIds` + `escopoMarcacao` em `marcarFichaComoPaga`.
- Complemento pós-pagamento: fichas pendentes fora do escopo do PIX confirmado.

---

## R) Regras para HB (fase B3 — fora do B1)

- Débito HB entra na base de desconto da ficha (`getResumoPagamentoParaRegistro` / conta coop).
- Cooperado **não** recalcula HB em “quanto vou receber” local isolado; consulta extrato HB gestão.
- Cron `operacional-hb-descontos-repair` alinha `contaCoopDescontos` na nuvem — **não** tocar no B1.

---

## S) Regras para sincronização

1. Gestão: pull → merge → push operacional (autoritativo quando não em cloud restore).
2. Cooperado: pull operacional + notas; **não** push operacional completo.
3. Pagamentos: rotas dedicadas `registrar-pagamento` / `confirmar-pagamento` mesclam JSON sem wipe total.
4. Full reset / wipeNotas: bloqueado por guards quando há notas conferidas ou pagamentos sensíveis.
5. Projeção BIC B1 deve respeitar `cooperadoPagamentosHydrated` / sync em andamento (não inventar valor antes do pull).

---

## Declaração obrigatória — B1

> **BIC B1 NÃO É AUTORIDADE DE ESCRITA.**  
> **BIC B1 É SOMENTE UMA CAMADA DE PROJEÇÃO/LEITURA.**

B1 pode introduzir `getProjecaoFinanceiraCooperadoBIC()` (nome proposto) que **delega** aos motores existentes, unificando **somente** o que Início e Quanto vou receber exibem, **sem** persistir, **sem** alterar `registrarPagamentoCooperado`, **sem** alterar merge sync, **sem** alterar HB.

---

## Referências de código (evidência B0)

- `src/types/index.ts` — `AppData`
- `src/services/dataStore.ts` — `STORAGE_KEY` / persistência
- `src/lib/supabase/cooperativaSyncStorage.ts` — `OperacionalSyncPayload`
- `src/services/notaPedidoService.ts` — motor ficha/pagamento
- `src/services/cooperadoEntregasService.ts` — projeção cooperado
- `src/services/cooperativaSyncCloudService.ts` — sync

---

*Documento gerado na Fase B0. Nenhum dado ou comportamento de produção foi alterado.*
