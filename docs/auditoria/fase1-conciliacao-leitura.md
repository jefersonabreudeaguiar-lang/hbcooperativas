# Fase 1 — Conciliação somente leitura

Data da execução: 2026-10-17  
Branch: `main`  
HEAD (antes e depois da fase, implementação): `5ef61d678fcb00fbfd2ef303ccb7c01544d3d39f`  
Escopo: cruzar obrigação × pagamento confirmado × motor Em aberto × Livro Caixa, **sem escrita**.

Este relatório não autoriza baixa de ficha, criação de PIX, lançamento de caixa nem correção de dados.

---

## 1. Ambiente efetivamente acessível

| Origem | Acessada? | Tipo | Limitação |
|---|---|---|---|
| Fixtures dos testes `v440`, `v456`, `v443` | Sim | In-memory, sintético | Não é produção |
| `scripts/diag-fase1-conciliacao-leitura.ts` | Sim | Fixtures sintéticos (aliases `C-SYN-01`, `f-*`) | Não é produção |
| `/api/client-release` (público) | Sim | Identidade do deploy | Sem operacional financeiro |
| `operacional.json` / Storage da cooperativa | **Não** | Produção | Credenciais de serviço existem no ambiente local, mas **não há autorização explícita** para extrair o operacional nesta fase. Consulta interrompida. Estado: **PENDENTE DE AUTORIZAÇÃO**. |
| Cópias em `scripts/backups/*.json` | **Não** | Cópias locais de origem incerta / possivelmente reais | Não lidas: risco de PII e de tratar cópia velha como ausência de PIX. |
| AppData do navegador do responsável | **Não** | Cópia local de sessão | Indisponível neste ambiente. |

**Decisão:** não usar `SUPABASE_SERVICE_ROLE_KEY` (presente no ambiente) para contornar o bloqueio. Ausência de linha no operacional **não consultado** não é evidência de que o PIX não existe.

Identidade pública do app (não é conciliação financeira):

- URL: https://hbcooperativas.vercel.app
- Build: 462
- SHA: `5ef61d678fcb00fbfd2ef303ccb7c01544d3d39f`
- deploymentId: `dpl_BSR5wXw3NLoe3BjC2wDNN4GzYPzc`

---

## 2. Fontes realmente inspecionadas

### 2.1 Código oficial (associação)

Arquivo: `src/services/notaPedidoService.ts`

- `getPagamentoConfirmadoCooperadoMes` — primeiro `pagamentosCooperado` com `status === "confirmado"` que cobre o mês (ID canônico do cooperado).
- `listarPagamentosConfirmadosQueCobremMes` — todos os confirmados que cobrem o mês.
- `fichaCobertaPorPagamentoCooperativa` (privada) — liquidação no motor se:
  1. `ficha.status === "pago"`; ou
  2. `pagamento.notaPedidoIds` contém `ficha.notaPedidoId`; ou
  3. `pagamento.fichaIds` contém `ficha.id`; ou
  4. nota `status === "pago"` / quitada por registro; ou
  5. **mesmo mês e timestamp da nota ≤ `pagoEm`**; ou
  6. mesmo mês sem data confiável → `true`.
- `listarFichasEmAbertoPagamento` — se há confirmado no mês, devolve só `listarFichasPendentesNaoCobertasPorPagamentoConfirmado`; senão, pendentes elegíveis.

**Regra desta fase (adendo):** `fichaIds` e `notaPedidoIds` podem **confirmar** vínculo na fonte consultada. O mês sozinho **localiza candidatos** e gera `ASSOCIACAO_AMBIGUA`. Não confirma liquidação.

Isso diverge do fallback temporal da função privada (itens 5–6). O motor pode **esconder** a ficha de Em aberto sem vínculo por ID. Essa divergência foi observada no caso sintético `D_pix_so_mes` e **não** foi usada para baixar nem para declarar o motor inválido. Decisão de produto pendente.

### 2.2 Leitura de totais (unidades diferentes)

- Conferir Em aberto: `getRelatorioPagarCooperadoEmAberto` → `listarMesesFichaEmAbertoCooperado(..., { usarLiquido: true })`.
- HB crédito-base: `hbCreditCreditoBaseReais` → mesmo enumerador **sem** `usarLiquido` (prefere `valorBruto`).
- Livro Caixa: `pagamentoCooperadoTemDebitoNoLivroCaixa` → existência de `origemId === pg_caixa_{pagamentoId}` e `tipo === "debito"`.

Pagamento presente **não** prova caixa correto. Caixa ausente na fonte consultada **não** autoriza criar lançamento.

### 2.3 Produção financeira

Não inspecionada. Os 23 registros e o total de R$ 228.488,81 são **valores informados previamente** (captura de tela do responsável, conversa anterior), **não** o resultado de uma nova consulta.

Classificação obrigatória: `PENDENTE_CONCILIACAO_PRODUCAO`.

---

## 3. Git antes da fase

```
branch: main...origin/main
HEAD: 5ef61d678fcb00fbfd2ef303ccb7c01544d3d39f
```

Implementação já estava dirty com WIP pré-existente (`ContaCoopContent`, `fichaSyncGuard`, workers, scripts `_once`/`_diag`, backups). Nada disso foi alterado nesta fase.

---

## 4. Testes executados (somente in-memory autorizados)

Pré-checagem: os três scripts **não** importam Supabase, **não** chamam `fetch`, **não** usam `writeFile`, **não** têm `APPLY`.

| Comando | Resultado | Saída sanitizada |
|---|---|---|
| `npx tsx scripts/test-cooperado-em-aberto-nao-reabre-pago-v440.ts` | OK | `test-cooperado-em-aberto-nao-reabre-pago-v440: OK` |
| `npx tsx scripts/test-responsavel-em-aberto-nao-oscila-v456.ts` | OK | `ok: em aberto estável — 9 cooperados não oscilam sem PIX` |
| `npx tsx scripts/test-hb-em-aberto-nao-inclui-mes-pago-v443.ts` | FALHOU | `AssertionError: 45 !== 50` em `relatorio[0].total` vs `hbCreditCreditoBaseReais` / expectativa 50 |
| `npx tsx scripts/diag-fase1-conciliacao-leitura.ts` | OK (diagnóstico) | ver agregados abaixo; sem rede, `escrita: false` |

Expectativas dos testes **não** foram alteradas para esconder a falha do v443.

Scripts **não** executados (efeito incerto ou escrita): `reconcile-livro-caixa-contabil-once.ts`, `repair-*`, `fix-*`, `scripts/_once-*`, `scripts/backups/*`, qualquer pull de operacional.

---

## 5. Quantidades e totais sustentados pelas fontes consultadas

### 5.1 Fixtures sintéticas (`diag-fase1-conciliacao-leitura.ts`)

Fonte: memória. Cooperado alias `C-SYN-01`. Valores 45/50 são da fixture (bruto 50, líquido 45), não de produção.

| Agregado | Quantidade |
|---|---|
| Fichas classificadas | 5 |
| `NAO_ENCONTRADO_NA_FONTE_CONSULTADA` | 1 |
| `CONFIRMADO_NA_FONTE_CONSULTADA` | 2 |
| `ASSOCIACAO_AMBIGUA` | 2 |
| `FONTE_INDISPONIVEL` | 0 nesta fixture |
| `PENDENTE_CONCILIACAO_PRODUCAO` | 0 nesta fixture |
| Permanecem no motor Em aberto | 2 |
| PIX com débito `pg_caixa_*` na fixture | 1 |
| PIX na fixture sem débito de caixa | 3 (o mesmo PIX pode servir duas fichas) |

### 5.2 Produção (informado previamente, não reconsultado)

| Item | Valor informado | Classificação |
|---|---|---|
| Cooperados em Em aberto (UI) | 23 | `PENDENTE_CONCILIACAO_PRODUCAO` |
| Total geral a pagar (UI) | R$ 228.488,81 | `PENDENTE_CONCILIACAO_PRODUCAO` |

Nenhum nome, CPF, PIX, comprovante ou valor individual real é reproduzido aqui.

---

## 6. Classificações e evidências (fixtures)

Separado: estado da ficha ≠ evidência de PIX ≠ caixa.

| Caso | Ficha | Status ficha | Evidência PIX | Vínculo oficial | Em aberto (motor) | Caixa `pg_caixa_*` | Motivo |
|---|---|---|---|---|---|---|---|
| A_sem_pix | f-aberta | pendente | `NAO_ENCONTRADO_NA_FONTE_CONSULTADA` | nenhum | sim | sem_pagamento | Sem `pagamentosCooperado` **nesta fixture**. Não prova ausência em produção. |
| B_pix_por_id_e_caixa | f-coberta | pago | `CONFIRMADO_NA_FONTE_CONSULTADA` | fichaIds | não | sim | ID oficial + motor vazio + débito presente na fixture. |
| C_complementar_pos_pix | f-antes | pago | `CONFIRMADO_NA_FONTE_CONSULTADA` | fichaIds | não | não | PIX no ID da ficha anterior. Caixa ausente **na fixture**, não autoriza lançar. |
| C_complementar_pos_pix | f-depois | pendente | `ASSOCIACAO_AMBIGUA` | mes_apenas | sim | não | Mesmo mês do PIX, **fora** de `fichaIds`/`notaPedidoIds`. Motor lista. Não classificado como “dívida nova”. |
| D_pix_so_mes | f-mes | pendente | `ASSOCIACAO_AMBIGUA` | mes_apenas | **não** | não | Motor cobre pelo fallback temporal/mês. Adendo: mês não confirma liquidação. |

### 6.1 Unidade líquido vs bruto (comprovado de novo)

Nos casos A e C, `conferirTotalLiquido = 45` e `hbCreditoBaseBruto = 50` na mesma fixture. O v443 espera igualdade em 50 e falha. **Não** se declara qual unidade é a “correta” sem decisão de negócio; apenas que o código implementa as duas.

---

## 7. Tabela de conciliação (produção)

| Lote | Obrigação | Pagamento | Saldo | Caixa | Fonte | Classificação |
|---|---|---|---|---|---|---|
| UI Em aberto (informado) | 23 linhas | não consultado | R$ 228.488,81 informado | não consultado | captura prévia, não reconsulta | `PENDENTE_CONCILIACAO_PRODUCAO` |

Não há identificadores de cooperado neste lote.

---

## 8. Limitações e decisões pendentes

1. **Autorização** para leitura sanitizada (apenas agregados / IDs hasheados) do `operacional.json` de produção.
2. **Complementar pós-PIX** (`f-depois`): o motor lista; o adendo proíbe chamar isso de dívida nova sem regra de negócio aprovada.
3. **Fallback mês+tempo** (`D` e `fichaCobertaPorPagamentoCooperativa`): o motor pode retirar da lista sem `fichaIds`/`notaPedidoIds`. Manter `ASSOCIACAO_AMBIGUA` até decisão.
4. **Líquido vs bruto** (v443).
5. **Caixa**: PIX sem `pg_caixa_*` na fonte consultada ≠ ordem para lançar; PIX com caixa ≠ prova de que o valor do caixa está certo.
6. Cópias `scripts/backups/*` não foram usadas. Se forem autorizadas no futuro, o diagnóstico deve emitir só agregados e aliases, nunca o JSON integral.

---

## 9. Git depois da fase

HEAD de implementação inalterado: `5ef61d678fcb00fbfd2ef303ccb7c01544d3d39f`.

Arquivos **novos** desta fase (únicos permitidos):

- `docs/auditoria/fase1-conciliacao-leitura.md` (este relatório)
- `scripts/diag-fase1-conciliacao-leitura.ts` (diagnóstico sintético, sem rede, sem escrita)

Nenhum arquivo em `src/` de implementação foi modificado nesta fase. WIP pré-existente permanece como estava.

---

## 10. Confirmações de encerramento

- [x] Fontes inspecionadas registradas (código + fixtures + identidade pública do deploy).
- [x] Ambiente acessível vs bloqueado registrado.
- [x] Testes autorizados executados; v443 falhou e a expectativa não foi alterada.
- [x] Quantidades/totais só das fontes consultadas; 23 / R$ 228.488,81 marcados como informados e `PENDENTE_CONCILIACAO_PRODUCAO`.
- [x] Classificações com os cinco estados exigidos; mês sem ID oficial = `ASSOCIACAO_AMBIGUA`.
- [x] Sem escrita em produção.
- [x] Sem alteração de arquivos de implementação.
- [x] Sem baixa, sem PIX inventado, sem lançamento de caixa.

**Fase 1 concluída para revisão.** A Fase 2 (reparação / baixa / caixa) **não** deve iniciar sem aprovação explícita deste relatório e, se for o caso, autorização de leitura sanitizada do operacional.
