# Responsável (gestão) — experiência única + lançamento ponta a ponta

**Liderança técnica:** agente · **Produção:** https://hbcooperativas.vercel.app  
**Escopo:** `responsavel`, `tesoureiro`, `admin` na UI de gestão — **sem ramos especiais por e-mail**.

## 1. Um produto para todos os operadores

| Camada | Comportamento |
|--------|----------------|
| **Identidade** | `evaluateResponsavelIdentidade` → `staffPainelUi` (não cai no Início cooperado) |
| **Lastro local** | `hb-staff-gestao-lkg-v1` + persist **por CNPJ** — nunca blob global |
| **F5 / reabrir** | `hydrateStaffGestaoFirstPaintFromLastro` no 1º quadro; persist no idle (~180 ms) |
| **Troca de CNPJ** | Memória do tenant anterior esvaziada (`preservarStaffGestaoContraWipe` + switch) |
| **Abas** | Keep-alive U4: Início, Conferir, Pagar, Livro pinados (celular e desktop) |

Não há “piloto responsável” separado no código — homologação é **SIM/NÃO** por fase (`FASE-R-RESPONSAVEL-CHECKLIST.md`).

---

## 2. Sync do dia (sem zerar, sem rajada)

| Momento | Tier | Objetivo |
|---------|------|----------|
| **Abertura / F5** | `financeiro_delta` se PIX/livro vazios; senão `notas_delta` | Hidratar frio **uma vez** |
| **Voltar ao app / idle** | `pulse` (ou `notas_delta` em `/notas-pedido`) | **Nunca** `operacional_full` nem `financeiro_delta` de novo |
| **Fila Conferir** | Poll próprio + 1º pull após 2 frames | Fila viva sem travar abertura |
| **Atualizar (botão)** | Pull staff dedicado | Visível; não bidirecional agressivo |
| **Loop live** | Tick leve no dashboard | Sem reset operacional em rajada |

**Lei:** conferir ≠ pagar — `docs/FILA-RESPONSAVEL-VS-FINANCEIRO.md`.

Cooperado recebe o que o responsável grava via revisão na nuvem (build cooperado **645+** — **não alterar** neste programa).

---

## 3. Paridade de valores (R3–R4)

- **Em aberto × Pagar** — mesmo motor de valor por cooperado (centavos).
- **Painel A pagar** — alinhado ao relatório em aberto (v500).
- **Atualizar 1×** — fichas/notas/PIX **não somem** (v497/v498 + `preservarStaffGestaoContraWipe`).

---

## 4. Gates técnicos (agente)

```powershell
npm run responsavel:verify:lancamento   # núcleo lançamento (contratos + paridade)
npm run responsavel:verify:fase-r       # lançamento + desempenho U4 + homolog nuvem read-only
```

Checklist humano: `docs/plano-mestre/FASE-R-RESPONSAVEL-CHECKLIST.md`  
Liderança e fases: `docs/plano-mestre/LIDERANCA-RESPONSAVEL-2026.md`

---

## 5. Portões R1→R5 (resumo)

| Fase | Foco |
|------|------|
| **R1** | Login → painel gestão; F5; troca cooperativa |
| **R2** | Abas 10×; keep-alive; Atualizar não trava fila |
| **R3** | Conferir → lançar → pagar (contratos preservar-app) |
| **R4** | Totais × nuvem; Atualizar não zera |
| **R5** | Ponta a ponta com cooperado (mobile + desktop operador) |

**HB Crédito / mercado** = **R6** após R5 **SIM** (não bloqueia núcleo).

---

## 6. Correção cirúrgica

1. Bump de `RESPONSAVEL_*_CONTRATO_VERSION` só com mudança intencional de regra.
2. Teste de contrato no gate antes de pedir SIM humano.
3. **Não** reabrir sync operacional no lifecycle (causa histórica de “zerou o responsável”).

**Resumo:** Gestão confiável = lastro no 1º quadro + sync frio só na abertura + paridade R$ travada em testes + homologação R5 com cooperado na nuvem.
