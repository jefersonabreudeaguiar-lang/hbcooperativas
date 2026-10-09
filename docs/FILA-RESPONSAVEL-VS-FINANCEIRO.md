# Fila do responsável × financeiro (marco zero)

O painel do **responsável** mistura contagens de **notas/conferência** e **dinheiro**. São domínios diferentes; zerar “a pagar” não implica fila de conferência vazia.

## O que cada número significa

| UI / métrica | Fonte | Inclui |
|--------------|--------|--------|
| **Fila do dia — Conferir entregas** | `countNotasFilaConferenciaResponsavel` | Notas `aguardando_conferencia` / `entregue` elegíveis (`notaElegivelParaFilaConferenciaResponsavel`), sem zombies |
| **Fila do dia — Pagar cooperados** | `countCooperadosPagamentoPendenteResponsavel` | Cooperados com ficha/pagamento **prontos para PIX** (não é contagem de notas) |
| **Painel “A pagar” (R$)** | `getAdminStats.valoresAPagar` | Soma líquida em aberto por cooperado (`getTotalAPagarCooperado`) |
| **Relatório em aberto** | `getRelatorioPagarCooperadoEmAberto` | Mesma base de valores; deve bater com o painel (tolerância centavos) |
| **Aba Em aberto (N cooperados)** | `countCooperadosLancamentosEmAbertoResponsavel` | Cooperados com **algum** lançamento financeiro em aberto (pode ser > 0 mesmo com R$ 0 no mês atual) |
| **Entregas pendentes (admin)** | `admin.entregasPendentes` | Alias operacional ligado à fila de conferência |

Código de referência: `src/services/filaDoDiaService.ts`, `src/services/responsavelPainelIndex.ts`, `scripts/audit-contadores-alinhamento-once.ts`.

## Caso típico: “todos pagos” mas ainda aparece 1 na fila

**Esperado** quando existe **1 entrega/nota aguardando conferência** (foto enviada, ainda não conferida). Isso **não** é saldo a pagar nem HB “a receber”.

Checklist:

1. `npx tsx scripts/audit-contadores-alinhamento-once.ts [cnpj]` — totais **R$** alinhados (painel = relatório).
2. `npx tsx scripts/audit-fila-conferencia-cooperativa-once.ts [cnpj]` — lista notas **elegíveis** vs zombies.
3. Na UI: **Notas → conferir** — concluir ou devolver a nota pendente.

Não use `repair-operacional` para “sumir” nota legítima na fila; repair corrige **ficha × pagamento × livro caixa**, não apaga entrega aguardando análise.

## Quando os R$ divergem (problema real)

Siga `docs/RUNBOOK-POS-PAGAMENTOS.md` (repair operacional + HB). Depois repita o passo 1 acima.

## Homologação rápida (30 s)

- Responsável: fila do dia — conferir vs pagar com contagens coerentes com as telas.
- Após pagar todos: **Pagar** = 0 e **A pagar** ≈ R$ 0; **Conferir** pode ser > 0.
- Cooperado: Início/Financeiro independentes da fila do responsável.
