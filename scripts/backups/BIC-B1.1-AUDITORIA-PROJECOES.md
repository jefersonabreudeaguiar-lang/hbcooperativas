# B1.1 — AUDITORIA DAS PROJEÇÕES FINANCEIRAS

**Data:** 2026-09-27  
**Escopo:** somente leitura/análise estática — **nenhum** arquivo de aplicação alterado neste passo.  
**Referência B0:** `BIC-CONTRATO-v0.md` (commit `df885fa`)

---

## 1. Motores encontrados

| Motor | Arquivo | Papel |
|-------|---------|--------|
| **M1** `getResumoPagamentoCooperado` | `notaPedidoService.ts` ~1818 | Cálculo “live” do mês: fichas + mensalidade + descontos + avulsos + HB (conta coop) |
| **M2** `getResumoPagamentoParaRegistro` | ~2098 | Wrapper: aplica HB descontos sobre resumo (exceto `omitirDescontosContaCoop`) |
| **M3** `getResumoValorAPagarRelatorio` | ~1916 | Relatório / total a pagar: trata aguardando, confirmado, complemento |
| **M4** `getTotalAPagarCooperado` | ~1716 | Soma `getResumoValorAPagarRelatorio` por mês(es) |
| **M5** `getResumoPagamentoExibicao` | ~2125 | Exibição: snapshot pagamento vs live; lógica aguardando complexa |
| **M6** `getValorQuantoVouReceber` | `cooperadoEntregasService.ts` ~519 | Total cooperado + recibo + multi-mês com assinatura pendente |
| **M7** `getResumoQuantoVouReceberCooperado` | ~589 | **Wrapper UI** sobre M6 + estados `carregando` / textos |
| **M8** `cooperadoExibirValorReceberInicio` | ~149 | **Wrapper Início** sobre M6 + regras `exibir` |
| **M9** `getConsolidadoFinanceiroCooperado` | ~415 | Consolida meses + M6 + resumo detalhado (alinha `valorLiquido` com M6) |
| **M10** `getValorExibicaoCooperado` | `notaPedidoService.ts` ~2068 | Número exibido ficha cooperado (mesmo que M2 aplicado ao resumo) |
| **M11** `getResumoMesEntregasCooperado` | `cooperadoEntregasService.ts` ~663 | Por mês: `valorAReceber` via M3 |
| **M12** `getCooperadoStats` | `dashboardService.ts` ~65 | Stats legado: M4 só **mês corrente** |
| **M13** `listarMesesPendentesFinanceiroCooperado` | ~335 | **Fork**: operacional authoritative → fila ficha; senão → lista entregas |

Auxiliares críticos (não são “motores” finais, mas governam resultado):

- `getPagamentoAguardandoCooperado` (~2324) + `pagamentoAguardandoSupersedidoPorConfirmado` (~2314)
- `mesesReferenciaComDebitoAberto` (~1736)
- `getDescontosContaCoopMesCached` (~1992) + memória sessão HB
- `listarFichasBaseCalculoPagamento` (~1479)

---

## 2. Ficha detalhada — alvos obrigatórios

### `getValorQuantoVouReceber`

| Campo | Valor |
|-------|--------|
| **Arquivo** | `src/services/cooperadoEntregasService.ts` |
| **Linhas** | ~519–580 |
| **Fonte principal** | **AppData** (`fichaCorrida`, `pagamentosCooperado`, `arquivosMensais`, notas indiretas) |
| **Fontes secundárias** | `isOperacionalCloudAuthoritative` (via `listarMesesPendentesFinanceiroCooperado`); avulsos; IDs canônicos |
| **Entradas** | `data`, `cooperadoId`, `cooperativaId?` |
| **Regras** | Meses pendentes via M13; se **sem** aguardando assinatura → `valor = getTotalAPagarCooperado` (todos meses); se **com** aguardando → soma meses **excluindo** meses cobertos pelo PIX aguardando; `valorRecibo = aguardando.valorLiquido`; labels de meses derivados de listas auxiliares |
| **Confirmado** | Indireto via M3/M4 (valor líquido 0) |
| **Aguardando** | `aguardandoAssinatura` se algum mês pendente tem aguardando; recibo separado do “a receber” |
| **Supersedido/stale** | Via `getPagamentoAguardandoCooperado` (filtra stale) |
| **Sync pending** | **Não** lido dentro da função — UI passa flags em M7 |
| **Complemento / multi-mês / parcial** | Multi-mês via consolidado; complemento via M3 |
| **HB** | Via M4→M3→M2 |
| **Saída** | `{ mes, meses, mesLabel, valor, valorRecibo, aguardandoAssinatura }` |
| **Persiste?** | **NÃO** |

### `getResumoQuantoVouReceberCooperado`

| Campo | Valor |
|-------|--------|
| **Arquivo** | `cooperadoEntregasService.ts` ~589–661 |
| **Fonte** | AppData via **M6** |
| **Regras** | Se `carregandoNuvem \|\| financeiroSincronizando` → estado `carregando`, `valorDestaque=0`; senão mapeia M6 para estados UI e textos |
| **Sync** | **Sim** — parâmetro `opts` (não altera cálculo numérico base, só apresentação) |
| **Persiste?** | **NÃO** |

### `getTotalAPagarCooperado`

| Campo | Valor |
|-------|--------|
| **Arquivo** | `notaPedidoService.ts` ~1716–1733 |
| **Fonte** | AppData |
| **Regras** | Com `mesReferencia`: M3 um mês; sem mês: soma M3 para cada mês em `mesesReferenciaComDebitoAberto` |
| **Aguardando** | M3 zera líquido se aguardando no mês |
| **Persiste?** | **NÃO** |

### `getResumoValorAPagarRelatorio`

| Campo | Valor |
|-------|--------|
| **Arquivo** | `notaPedidoService.ts` ~1916–1948 |
| **Fonte** | AppData |
| **Regras** | 1) Aguardando → resumo do pagamento com **valorLiquido=0**; 2) Confirmado sem pendentes → snapshot confirmado, líquido 0; 3) Confirmado + complementares → resumo só complementares (HB omitido no registro complementar); 4) Senão live M1 + M2 |
| **Persiste?** | **NÃO** |

### `CooperadoFichaPanel` (componente)

| Campo | Valor |
|-------|--------|
| **Arquivo** | `src/components/cooperado/CooperadoFichaPanel.tsx` |
| **Fonte** | `useAppData()` → **localStorage-backed AppData** |
| **Cálculo total exibido** | Multi-mês: `getConsolidadoFinanceiroCooperado` → `valorLiquido`; mês único: `getResumoPagamentoExibicao` + **`getValorExibicaoCooperado`** (M10) |
| **Reação HB** | `useContaCoopDescontosRevision` força recomputação |
| **Divergência vs Início** | Início usa M8→M6; ficha usa M9/M5/M10 — **mesma família M1–M2**, caminhos diferentes |
| **Persiste?** | **NÃO** (exceto ações cadastro diretoria — fora projeção) |

---

## 3. Tabela comparativa de motores

| Motor | Fonte | Regra | Pagamento | Stale | HB | Múltiplos meses | Persistência |
|-------|-------|-------|-----------|-------|-----|-----------------|--------------|
| M1 live | AppData ficha | Soma fichas base | Não congela | N/A | Sim (cached) | Por mês | Não |
| M3 relatório | AppData | Zera se aguardando/quitado | Snapshot | Supersedido em aguardando | Sim (exc. complemento omit) | Por mês | Não |
| M4 total | AppData | Soma M3 | Idem | Idem | Idem | `mesesReferenciaComDebitoAberto` | Não |
| M5 exibição | AppData | Mistura snap/live aguardando | Snapshot rico | Parcial | Sim | Delega consolidado | Não |
| M6 quanto vou receber | AppData | Split recibo vs aberto | Sim | Via get aguardando | Via M4 | Sim | Não |
| M7/M8 UI | M6 | Texto/flags | Sim | Idem | Idem | Idem | Não |
| M9 consolidado | AppData | M6 + resumo M5 | Sim | Idem | Idem | Sim | Não |
| M10 valor exibição | M1→M2 | HB no líquido | Não separa recibo | NECESSITA HOMOLOG | Sim | Por mês filter UI | Não |
| M12 stats | AppData | M4 **só mês atual** | Idem | Idem | Idem | **Não** | Não |

---

## 4. Respostas comparativas (3)

1. **Mesma coisa:** M4 e M6.`valor` quando `!aguardandoAssinatura` (teste guard exige igualdade card/total). M3 e `valorLiquidoMesQuantoVouReceber` por mês.
2. **Regras diferentes:** M5/M10 vs M3 para mês com aguardando (M5 reconstrói live+snap); M12 vs M6 (mês corrente only); M13 authoritative vs lista por entregas.
3. **Wrappers:** M7, M8, M2 (parcial), `resumoFromPagamento`, M9 (parcial).
4. **Mais próxima do negócio “saldo a receber”:** **`getResumoValorAPagarRelatorio`** + agregação **`getTotalAPagarCooperado`**, com **`getValorQuantoVouReceber`** como orquestrador cooperado (recibo vs aberto).
5. **Duplicadas:** HB aplicado em M1 e again M2; listagem meses em 3 variantes (pendentes entregas / operacional / debito aberto).
6. **Conflitantes:** `getResumoPagamentoExibicao` vs `getResumoValorAPagarRelatorio` em cenários aguardando+live>0; **CooperadoFichaPanel** multi-mês usa `consolidadoFinanceiro.valorLiquido` vs single-month M10.
7. **Fallback escondido:** `listarFichasBaseCalculoPagamento` inclui fichas `pago` “fantasma” se mês sem pagamento registrado; M5 retorna snap se `live.valorEntregas <= 0`.
8. **localStorage:** Toda leitura via `AppData` carregado de `coopeagriplla_data` — **sim**, indireto.
9. **operacional.json:** **Indireto** — dados já mergeados em AppData; **M13** muda algoritmo se `isOperacionalCloudAuthoritative(cnpj)`.
10. **notas_pedido:** **Indireto** — validação ficha (`fichaValidaNoExtrato`, status nota); não lê Postgres no browser.
11. **HB:** **Sim** — `getDescontosContaCoopMesCached`, memória sessão, `arquivosMensais.contaCoopDescontos`.
12. **Sync:** **UI only** (M7 opts, dashboard `cooperadoPagamentosHydrated`, `useCooperadoExibirAguardandoAssinatura`) — motores puros não recebem flag sync.

---

## 5. Divergências documentadas (não corrigir)

| ID | Descrição |
|----|-----------|
| D1 | Início: `cooperadoExibirValorReceberInicio` zera `valor` quando aguardando assinatura; banner/link usa `valorRecibo` separado |
| D2 | Ficha cooperado (gestão view): `getValorExibicaoCooperado` vs Início M6 sem passar pelo mesmo wrapper |
| D3 | `getCooperadoStats.valorAReceber` = mês corrente apenas — não é “quanto vou receber” global |
| D4 | Complemento pós-pagamento: M3 omite HB (`omitirDescontosContaCoop`) — pode divergir de M1 live com HB |
| D5 | Forense histórica Orlando ~R$250: `getResumoPagamentoCooperado` vs `getResumoPagamentoParaRegistro` (docs h89249) — **NECESSITA HOMOLOGAÇÃO** se ainda ocorre no HEAD |
| D6 | M13 authoritative: meses pendentes sem passar por `getTotalAPagarCooperado` por entrega |

---

## 6. Proveniência (cadeias comprovadas)

### Cooperado — card “Total a receber” (Início)

`pagamentosCooperado` / `fichaCorrida` / notas (sync merge → AppData localStorage)  
→ `getResumoPagamentoCooperado` + `getResumoPagamentoParaRegistro` (por mês)  
→ `getResumoValorAPagarRelatorio` → `getTotalAPagarCooperado`  
→ `getValorQuantoVouReceber`  
→ `cooperadoExibirValorReceberInicio`  
→ `dashboard/page.tsx` cards  
→ cooperado

### Cooperado — “Assinar recibo”

`pagamentosCooperado` (`aguardando_confirmacao`, filtrado supersedido)  
→ `getPagamentoAguardandoCooperado`  
→ M6 `valorRecibo` / M8 `aguardandoAssinatura`  
→ dashboard + `ficha-corrida` (`getResumoQuantoVouReceberCooperado`)  
→ cooperado

### Ficha painel verde “A receber”

AppData  
→ `getConsolidadoFinanceiroCooperado` OU `getResumoPagamentoExibicao`  
→ `getValorExibicaoCooperado` (HB)  
→ `CooperadoFichaPanel`  
→ responsável/cooperado na aba ficha

### Responsável — fila pagar

AppData  
→ `listarMesesPendentesPagamentoResponsavel` (M13)  
→ `getTotalAPagarCooperado` / `getResumoPagamentoCooperado` na UI ficha-corrida  
→ responsável

---

## 7. Casos de caracterização (análise estática)

| Caso | Representável no código? | Notas |
|------|---------------------------|--------|
| 1 Sem pagamento | **Sim** | M3 live > 0, sem aguardando |
| 2 Aguardando | **Sim** | M3 líquido 0; M6 recibo > 0 |
| 3 Confirmado | **Sim** | M3 líquido 0 |
| 4 Confirmado + assinatura | **Sim** | `status confirmado` + campos assinatura; stale filtrado |
| 5 Novo valor pós-pagamento | **Sim** | `fichasPendentesComplementaresPosPagamento` + teste guard ~1010 |
| 6 Múltiplas notas | **Sim** | Soma fichas; pagamento parcial via ids |
| 7 Múltiplas fotos | **Sim** | Valor pós-conferência (ficha), não contagem fotos |
| 8 Múltiplos meses | **Sim** | M4 multi-mês; M6 consolidado |
| 9 HB existente | **Parcial** | M2 aplicado; divergência D4/D5 — **NECESSITA HOMOLOGAÇÃO** Orlando |
| 10 Histórico antigo | **Sim** | `cooperadoMesQuitado` |
| 11 Sincronizados | **Parcial** | Motores iguais; timing UI — **NECESSITA HOMOLOGAÇÃO** browser |
| 12 Stale | **Sim** | Teste `pg_stale_aguardando` + confirmado → aguardando undefined (~1020+) |

---

## 8. Caso Orlando (regras no código — sem tocar dados)

**IDs forenses (testes/scripts):** cooperado `c_1782263929381_ncp55`; pagamento exemplo `pg_confirmado_orlando`; produção CNPJ `62351750000165`.

| Tópico | Mecanismo |
|--------|-----------|
| **Identificar pagamento** | `data.pagamentosCooperado` match `cooperadoId` canônico + `pagamentoCobreMesReferencia` + `status` |
| **Confirmação** | `getPagamentoConfirmadoCooperadoMes` / `getPagamentoConfirmadoMes` → `status === "confirmado"` |
| **Assinatura** | Campos `assinaturaCooperado`, `assinadoEm` no registro (UI confirma via `confirmarPagamentoCooperado`) |
| **Saldo** | M3: confirmado sem pendentes → líquido 0; complemento se fichas fora do escopo do PIX |
| **Telas** | AppData pós-sync; Início M8; ficha M7; possível HB via descontos conta coop |
| **Stale** | Dois registros mesmo mês: `pagamentoAguardandoSupersedidoPorConfirmado` esconde aguardando se **todos** meses do aguardando têm confirmado (commit `20d9dea`); teste guard replica cenário Orlando-shaped |
| **Risco residual** | localStorage desatualizado vs nuvem — **NECESSITA HOMOLOGAÇÃO** produção; HB Δ250 documentado em forense — **NECESSITA HOMOLOGAÇÃO** se HEAD ainda diverge |

---

## 9. Risco da facade `getProjecaoFinanceiraCooperadoBIC()`

### Classificação: 🟡 **SEGURO COM CONDIÇÃO**

**Por quê não 🟢:** existem **dois caminhos de exibição** (M6/M8 vs M9/M5/M10) e **fork M13** authoritative; facade que escolher “a função errada” congela divergência.

**Por quê não 🔴:** núcleo cooperado Início + Quanto vou receber **já converge** em M6; testes guard amarram M6≈M4; stale tratado no motor aguardando.

**Condições para B1.2:**

1. Facade deve **delegar** explicitamente a **M6 + M7** (e M8 para Início `exibir`), **não** reimplementar.
2. Escopo B1.2 **excluir** `CooperadoFichaPanel` até fase posterior (ou documentar segunda onda).
3. Passar through **sync opts** (`carregandoNuvem`, `financeiroSincronizando`, `cooperadoPagamentosHydrated` na UI).
4. Testes caracterização B0 + guard stale + complemento **obrigatórios** antes de merge.
5. Não unificar HB/Conta Coop na facade (B3).

---

## 10. Recomendação final

### **GO B1.2 COM CONDIÇÕES**

Implementar facade como **delegação fina** a `getValorQuantoVouReceber` + `getResumoQuantoVouReceberCooperado` + `cooperadoExibirValorReceberInicio` (três entrypoints documentados), sem alterar motores M1–M4 neste passo. Homologar Orlando/stale/HB em paralelo.

**Não implementar B1.2 neste documento.**

---

## Verificação de alterações (passo 9)

`git status --short` em `src/` mostra modificações **pré-existentes** (WIP local, **não** introduzidas por B1.1):

- `src/app/(app)/livro-caixa/page.tsx`
- `src/app/(app)/notas-pedido/NotasPedidoContent.tsx`
- `src/components/notas/CorrecoesEntregasPanel.tsx`

Nenhuma alteração nova foi feita em código de aplicação durante B1.1. Este relatório foi adicionado apenas em `scripts/backups/BIC-B1.1-AUDITORIA-PROJECOES.md`.

---

## Marco de progresso

| Fase | Progresso |
|------|-----------|
| **B0** | **100%** (inventário + contrato + matriz + testes spec + commit `df885fa`) |
| **B1.1** | **100%** (esta auditoria) |
| **B1 total** | **~35%** (audit done; facade B1.2 + refator UI B1.3 pendentes) |
| **BIC total** | **~22%** (B0 completo + primeira fatia de B1; B2–B4 intactos) |

**BIC implantada?** **NÃO.**  
**B1 concluído?** **NÃO** (somente B1.1).
