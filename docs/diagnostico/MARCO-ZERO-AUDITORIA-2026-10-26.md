# Passo 1 — Auditoria read-only na nuvem (CoopeagriPla)

**CNPJ:** `62351750000165`  
**Gerado:** 2026-10-26 (horário local do operador)  
**Escopo:** somente leitura Supabase + `operacional.json`; **nenhum** repair, upload ou wipe.  
**Diagnóstico marco zero:** [`MARCO-ZERO-POS-PAGAMENTO.md`](./MARCO-ZERO-POS-PAGAMENTO.md)

---

## Scripts executados

| Script | Exit | Tempo (~) | Observação |
|--------|------|-----------|------------|
| `audit-contadores-alinhamento-once.ts` | **1** (divergência) | ~4 min | Painel/relatório vs soma por cooperado |
| `audit-hb-base-vs-valor-receber.ts` | **0** | ~9 min | HB base × card “a receber” |
| `audit-hb-limites-ghost.ts` | **0** | ~1 min | Limites HB na nuvem |
| `audit-todos-relatorios-alinhamento.ts` | *em andamento / parcial* | >15 min | Seções 1–5 no terminal; JSON ao final em `backups/auditoria/` |

**Lacuna no repo:** `audit-a-receber-vs-ficha-once.ts` (citado em `run-weekly-audits.ts`) **não existe**; o cruzamento cooperado foi coberto por `audit-todos-relatorios-alinhamento.ts` (quando concluir) e `audit-hb-base-vs-valor-receber.ts`.

---

## 1. Totais “a pagar” (responsável) — achado principal

### `audit-contadores-alinhamento-once.ts`

| Métrica | Valor (R$) |
|---------|------------|
| Painel “A pagar” | **43.129,66** |
| `getTotalValoresAPagarEmAberto` | **43.129,66** |
| Soma `getTotalAPagarCooperado` (todos ativos) | **41.181,93** |
| Relatório em aberto (linhas) | **43.129,66** (13 cooperados) |
| Fichas pendentes (painel) | 100 |
| Entregas pendentes fila | 19 |

**Δ painel/relatório − soma por cooperado = R$ 1.947,73** → script encerra com **⚠ Divergência nos totais a pagar**.

**Mapa receitas × notas (últimos 3 meses):** ✓ 2026-10, 2026-09, 2026-08 alinhados.

### Trecho parcial `audit-todos-relatorios-alinhamento.ts` (seção 4)

| Métrica | Valor (R$) |
|---------|------------|
| Painel “A pagar” | **41.181,93** |
| Soma `getTotalAPagarCooperado` | **41.181,93** ✓ |
| Relatório em aberto (função + linhas) | **43.129,66** |

**Interpretação (marco zero de dados, não de UI):** duas funções de negócio **não batem**:

- **`getTotalAPagarCooperado`** (soma cooperado a cooperado) → **41.181,93**
- **`getTotalValoresAPagarEmAberto` / relatório em aberto** → **43.129,66**

A diferença **R$ 1.947,73** coincide com a linha do cooperado **Cleber viana de Oliveira** no audit HB (`baseHB 2.050,24` vs `aReceber(app) 1.947,73`, Δ **0,00** em entregas−receber com flag `* base≠receber`). Ou seja: há cooperado(s) em que o **relatório em aberto** ainda conta valor que o **total por cooperado** (regra pós-pagamento/HB/desconto) não soma igual — típico **depois de PIX/HB/descontos em ficha**, não de “cache PWA”.

Isso explica parte da sensação pós-primeiro pagamento: **painel e card podem usar caminhos de cálculo diferentes** enquanto a nuvem já está em estado “liquidado parcial / HB usado”.

---

## 2. Integridade nota × ficha × conciliação

### `audit-todos-relatorios-alinhamento.ts` (stdout parcial)

- **341** notas | **408** fichas | **26** cooperados  
- **20** notas sem itens (várias `2026-10`, ids `np_17927…`)  
- **52** alertas nota × ficha (bruto) — exemplos:
  - Cleones Sousa Burmann | 2026-10: nota R$ 716,76 vs ficha R$ 358,38 (e outras no mesmo padrão **metade**)
  - Roseli Ramalho da silva | 2026-10: nota R$ 5.602,62 vs ficha R$ 207,19  
- **Conciliação mensal (entregas × ficha):**
  - 2026-10: Δ **R$ 17.197,79**
  - 2026-09: Δ **R$ 56.941,07**
  - 2026-08: Δ **R$ 40.232,99**

**Nota:** muitos alertas “nota vs ficha” no script comparam **bruto nota vs soma ficha** sem o mesmo critério de `dedupe`/pago parcial; ainda assim, Cleones/Roseli indicam **ficha fragmentada ou pós-pagamento** — alinhado ao marco A (PIX + complementar).

### `audit-totais-cooperados.ts` (amostra)

- 12 notas com fichas duplicadas (antes dedupe lógico)  
- 51 somas ficha ≠ valor nota  
- Painel admin “A pagar” (soma bruta ficha pendente): **R$ 39.679,31** (terceira métrica legada — não usar como SSOT sem cruzar com tabela acima)

---

## 3. HB Créditos × “A receber” (cooperado)

### `audit-hb-base-vs-valor-receber.ts` (teto 0%)

| Cooperado | base HB | a receber (app) | Observação |
|-----------|---------|-----------------|------------|
| **Jeferson Abreu de Aguiar** | 3.232,56 | **2.520,38** | Δ base−receber implícito; **HB usado R$ 550,55** na nuvem |
| CLEITO VIANA DE OLIVEIRA | 6.401,45 | 5.613,01 | ent−rec **468,37** |
| Cleber viana de Oliveira | 2.050,24 | 1.947,73 | ligado ao Δ **1.947,73** do relatório |
| Demais com saldo | … | … | maioria `* base≠receber` por descontos/HB (esperado com HB ativo) |

**Totais cooperativa:**

| Σ | Valor (R$) |
|---|------------|
| base HB (a receber) | 44.421,94 |
| valor a receber app | **41.181,93** |
| diferença base − receber | 3.240,01 |
| limite liberado nuvem | 8.306,24 |

**Piloto Jeferson:** valor líquido exibido **abaixo** da base HB por **uso de crédito HB (R$ 550,55)** — comportamento de **pós-pagamento**, não necessariamente bug de card; validar na UI se bate com Financeiro após build **691** + cache limpo.

### `audit-hb-limites-ghost.ts`

- Σ limite **R$ 8.884,38** | 12 contas com limite > 0  
- Jeferson: lim **646,51** | usado **550,55** | base **3.232,56**  
- Sem evidência de “limite fantasma” crítico no output (exit 0)

---

## 4. Ligação com marco zero (primeiro pagamento)

| Evidência hoje na nuvem | Efeito no app |
|-------------------------|---------------|
| `pagamentosCooperado` + fichas pagas/parciais + HB `amount_used` | Vários totais (painel, relatório, card, HB base) |
| Fichas duplicadas / nota≠ficha em cooperados com PIX no mês | Card “A receber” e abas oscilam após sync |
| Relatório em aberto **>** soma `getTotalAPagarCooperado` em **R$ 1.947,73** | Responsável vê um total; regra por cooperado outro |
| Conciliação mensal com Δ de dezenas de milhares em 08–10 | Contador/responsável “não fecha” visualmente |

**Nenhum item acima foi corrigido neste passo** (read-only).

---

## 5. Passo 2 (código) — paridade «a pagar»

**Problema:** painel/Em aberto somavam **R$ 43.129,66** via notas “sem PIX” enquanto `getTotalAPagarCooperado` (pós-PIX/HB) somava **R$ 41.181,93** (Δ **R$ 1.947,73** ≈ Cleber).

**Correção (repo local):**

- SSOT do painel: `totalValoresAPagarGestaoUnificado` = soma `getTotalAPagarCooperado`.
- `valorAPagarCooperadoEmAberto` usa `getResumoValorAPagarRelatorio` por mês.
- Extras do Em aberto só entram se `getTotalAPagarCooperado` > 0.
- Teste: `scripts/test-responsavel-paridade-totais-a-pagar.ts`.
- Script ausente recriado: `scripts/audit-a-receber-vs-ficha-once.ts`.

**Nuvem:** nenhum repair executado no passo 2.

**Reauditoria local (código novo):** `audit-contadores-alinhamento-once.ts` → **OK** — painel, relatório e soma cooperado **R$ 41.181,93** (12 linhas; contagem Em aberto 13 = cooperado fantasma só na lista, fora do total).

---

## 6. Próximos passos recomendados (passo 3+, só com sua autorização)

1. **Esperar/conferir** JSON final de `audit-todos-relatorios-…json` em `backups/auditoria/` (mesma execução de hoje).  
2. **Não** rollback cego de código: primeiro alinhar **qual função é SSOT** para “A pagar” e “A receber” com os testes `test-cooperado-financeiro`.  
3. Se autorizar **repair** (runbook): `repair-operacional-pagamentos-integridade.ts` **somente** após diff explícito — fora do escopo do passo 1.  
4. Homologação Jeferson: Início + Financeiro vs tabela Jeferson acima (**R$ 2.520,38** líquido app).

---

## 6. Artefatos

- Logs locais: terminal da sessão do agente (stdout dos scripts).  
- Histórico JSON anterior (22/10): `backups/auditoria/audit-todos-relatorios-62351750000165-1792705347825.json` (`tudoOk: false`, meses conciliação 0/3).
