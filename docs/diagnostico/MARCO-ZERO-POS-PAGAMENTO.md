# Marco zero — instabilidade após o primeiro pagamento

Documento de auditoria e diagnóstico (read-only sobre dados; análise de código e histórico de release).  
**Cooperativa piloto:** CoopeagriPla — CNPJ `62351750000165`.  
**Piloto cooperado:** Jeferson — `jefersonabreudeaguiar@gmail.com`, `c_1781981564381_w67gg`.

**Atualizado:** 2026-10-26  
**Relatório de nuvem (passo 1):** ver `MARCO-ZERO-AUDITORIA-2026-10-26.md` (gerado no mesmo dia).

---

## 1. Pergunta que este documento responde

Por que, **depois do primeiro pagamento real**, o app cooperado (e em parte o responsável) **pareceu nunca mais estabilizar** — tela branca, travamento, crash do Chrome, “A receber” zerado ou errado — mesmo com dezenas de builds de correção?

---

## 2. Resumo executivo

| Fato | Conclusão |
|------|-----------|
| Antes do PIX em produção | Grafo simples: ficha + notas conferidas; poucos estados pós-liquidação. |
| Após o primeiro PIX confirmado | **Estado persistente na nuvem** (`pagamentosCooperado`, fichas pagas, livro caixa, arquivo mensal, recibo, complementar, HB no mercado). |
| Resposta do software | Centenas de commits (build ~238 → ~691): regras em `notaPedidoService`, sync operacional, snapshots PWA, GA “experiência Jeferson para todos”, quiescência, rematerialização. |
| Rollback de código | **Não** restaura dados; **não** devolve PWA/localStorage; tag v644 ≠ app bit-a-bit com operacional de 2026. |
| **Marco zero (raiz)** | Cruzamento **dados pós-pagamento** + **regras multi-fonte** + **camada de performance/sync empilhada** sem linha de produto congelada e homologada ponta a ponta. |

O primeiro pagamento **não “quebrou o banco”** sozinho: ele **ativou** um modo de operação que o código ainda estava aprendendo a ler de forma consistente em **responsável, cooperado, BIC/HB e PWA**.

---

## 3. Dois marcos (não confundir)

### Marco A — negócio (campo)

- Primeiro(s) **pagamento(s) cooperado** confirmados na cooperativa real.
- Efeitos em `operacional.json`: `pagamentosCooperado`, `fichaCorrida` (pago/parcial), `livroCaixa`, `arquivosMensais`, vínculo nota ↔ pagamento.
- Runbook: [`docs/RUNBOOK-POS-PAGAMENTOS.md`](../RUNBOOK-POS-PAGAMENTOS.md).  
- Fila conferência vs dinheiro: [`docs/FILA-RESPONSAVEL-VS-FINANCEIRO.md`](../FILA-RESPONSAVEL-VS-FINANCEIRO.md).

### Marco B — software (complexidade e releases)

| Faixa (indicativa) | Tema |
|--------------------|------|
| ~238–240 | Recibo pós-PIX, quitar ficha, verificação “marco zero” operacional |
| ~361+ | Alinhar “a receber” responsável com ficha após PIX |
| ~429 | Anti–sync storm HB (`rollback/pre-hb-sync-storm-429`) |
| ~437+ | Contratos / Pagar responsável |
| ~493–494, v644 | Piloto mobile Jeferson Fase 3 (tag `cooperado-mobile-fase3-v644`) |
| 378+ | `isCooperadoMobileGaPromoted` — mesma UX pesada do piloto para **todo** `role === cooperado` |
| 684–691 | Quiescência, shell de abertura, complementar pós-PIX (688), snapshot-first (690–691), typecheck que bloqueou deploy (685 vs main) |

Referências: [`docs/changelog/cooperado-por-build.md`](../changelog/cooperado-por-build.md), [`docs/release/COOPERADO-JEFERSON-VS-PRODUCAO.md`](../release/COOPERADO-JEFERSON-VS-PRODUCAO.md), [`docs/ARQUITETURA.md`](../ARQUITETURA.md), [`docs/ROLLBACK_POINTS.md`](../ROLLBACK_POINTS.md).

**Marco zero operacional para decisão = A + B.**

---

## 4. O que o primeiro pagamento mudou no modelo de dados

Fonte canônica de desenho: [`docs/ARQUITETURA.md`](../ARQUITETURA.md).

Depois do pagamento, “quanto o cooperado recebe” deixa de ser só soma de ficha pendente:

1. **Escopo do PIX** — só notas/fichas ligadas ao `pagamentoId` contam como cobertas; o resto do mês pode ser **complementar**.
2. **Mês “liquidado”** — regras que evitam reabrir indevidamente, mas que **erraram** quando trataram o mês inteiro como quitado (corrigido com testes em `scripts/test-cooperado-financeiro-guard.ts`, build 688).
3. **HB Créditos** — ciclo após liquidação (`hbCreditCicloAposLiquidacao`), descontos em arquivo mensal, paridade BIC.
4. **Recibo / assinatura** — estados intermediários (`aguardando_confirmacao` vs `confirmado`).

Qualquer sync que traga operacional **parcialmente** atualizado gera sintomas opostos: zero indevido, valor fantasma, ou UI que recalcula em loop.

---

## 5. Por que a instabilidade pareceu crônica (cadeia causal)

```mermaid
flowchart TD
  A[PIX confirmado na nuvem] --> B[Regras pós-pagamento + HB + complementar]
  B --> C[Sync operacional / revisão na nuvem]
  C --> D[Snapshots e card A receber no PWA]
  D --> E[GA: mesmo pacote do piloto para todos cooperados]
  E --> F[Rematerialização / quiescência / dual-mount / BIC na abertura]
  F --> G[Main thread / OOM / crash Chrome]
  G --> H[Builds corretivos empilhados]
  H --> B
  I[Build Vercel falha] --> J[Produção em build antigo ex. 685]
  J --> G
```

### 5.1 Camada UX/performance (não apaga dados, mas derruba o app)

- Promoção GA: [`src/lib/cooperado/cooperadoMobilePilot.ts`](../../src/lib/cooperado/cooperadoMobilePilot.ts) — `isCooperadoMobileGaPromoted`.
- Aparelho “quente” (snapshots) vs “frio” (sync na abertura): [`docs/release/COOPERADO-JEFERSON-VS-PRODUCAO.md`](../release/COOPERADO-JEFERSON-VS-PRODUCAO.md).
- Builds 684–687: quiescência de aba/abertura; **685** marcou quiescência no render (piorou até 687).
- **689–690:** `viewLive` + idle; mobile sem dual-mount fixo em parte do caminho.
- **690–691:** snapshot-first de novo para GA; fix TS em `useCooperadoInicioValorReceberCardState.ts` para destravar Vercel.

### 5.2 Camada regra financeira (dados corretos na nuvem, leitura errada no app)

- `notaPedidoService`: `fichaCobertaPorPagamentoCooperativa`, `getResumoValorAPagarRelatorio`, complementar pós-PIX.
- Piloto: [`docs/pilot/COOPERADO-JEFERSON-STATUS.md`](../pilot/COOPERADO-JEFERSON-STATUS.md).

### 5.3 Fratura de deploy

- `main` avançou enquanto produção ficou em build anterior por **falha de `npm run build`** — usuário testa código que não está no ar.

---

## 6. Por que “backup exato” não voltou ao início

| Expectativa | Realidade |
|-------------|-----------|
| `restore:cooperado-backup-code` (v644) | Restaura **slice cooperado**; mantém gestão, `dataStore`, arquivos pós-tag. |
| Nuvem | Pagamentos e fichas pagas **permanecem** — obrigatório manter regras pós-PIX. |
| PWA | Service worker + `localStorage` misturam eras de build. |
| Filosofia | Rollback de código ≠ rollback de dados — [`docs/FILOSOFIA-PRODUCAO.md`](../FILOSOFIA-PRODUCAO.md). |

**Voltar só o código pré-pagamento com operacional atual = regressão de valores**, não “app como no dia 1”.

---

## 7. O que NÃO é a raiz sozinha

- E-mail do Jeferson (piloto vs GA — negócio não bifurca por e-mail).
- Uma única linha de splash ou quiescência (sintoma amplificado).
- “Só cache” sem divergência de regra (cache piora, mas o grafo pós-pagamento é o terreno).

---

## 8. Linha estável alvo (sem apagar cooperados nem operacional)

Princípios:

1. **Congelar contrato de dados** — `npm run test:cooperado-financeiro`, `gate:preservar-app`, paridade responsável quando aplicável.
2. **Composição de código** — UI/sync de referência: tag `cooperado-mobile-fase3-v644` + patches **só** de regra financeira comprovados (ex. complementar 688, abertura 691).
3. **Responsável** — baseline documentada em [`docs/plano-mestre/LIDERANCA-RESPONSAVEL-2026.md`](../plano-mestre/LIDERANCA-RESPONSAVEL-2026.md).
4. **Nuvem** — auditoria read-only → repair **apenas** se R$ divergirem ([`RUNBOOK-POS-PAGAMENTOS.md`](../RUNBOOK-POS-PAGAMENTOS.md)).
5. **Produção** — `npm run build` + `npm run confirm:production:wait` antes de declarar alinhamento.

---

## 9. Passo 1 — auditoria read-only (protocolo)

Ordem executada em 2026-10-26 (CNPJ piloto):

1. `npx tsx scripts/audit-contadores-alinhamento-once.ts 62351750000165` — painel × relatório a pagar.
2. `npx tsx scripts/audit-todos-relatorios-alinhamento.ts 62351750000165` — cruzamento responsável × cooperado × ficha (substitui script ausente `audit-a-receber-vs-ficha-once.ts` referenciado em `run-weekly-audits.ts`).
3. `npx tsx scripts/audit-hb-base-vs-valor-receber.ts 62351750000165` — HB base × valor a receber.
4. `npx tsx scripts/audit-hb-limites-ghost.ts` — limites fantasma HB.

**Nota técnica:** `scripts/audit-a-receber-vs-ficha-once.ts` está listado em `run-weekly-audits.ts` mas **não existe** no repositório; o passo 2 acima cobre a mesma intenção até o script ser recriado.

Resultados consolidados: **`MARCO-ZERO-AUDITORIA-2026-10-26.md`**.

Nenhum script acima altera `operacional.json` nem apaga cooperados.

---

## 10. Homologação humana (portão final)

Checklist SIM/NÃO (não substituído por commit):

- Responsável: conferir → lançar → pagar → relatório em aberto.
- Cooperado: Início (card), abas, Financeiro, Entregas — após limpar dados do site **ou** PWA atualizado.
- Piloto Jeferson em produção com build confirmado (`confirm:production:wait`).

---

## 11. Histórico deste documento

| Data | Ação |
|------|------|
| 2026-10-26 | Criação do diagnóstico marco zero + execução passo 1 (auditoria nuvem) |
