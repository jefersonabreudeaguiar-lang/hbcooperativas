# Liderança do app responsável (gestão) — plano de lançamento

**Responsável técnico:** agente · **Produção:** https://hbcooperativas.vercel.app  
**Papel do operador (você):** validar **SIM/NÃO** por fase no celular **e** no desktop — mesmo modelo do cooperado.

**Pré-requisito cooperado:** Fases 1–3 **SIM** (piloto); Fase 4 homolog em andamento.  
**Objetivo:** responsável **confiável para lançamento** — conferir, lançar, pagar, sem zerar dados, com paridade R$ e cooperado recebendo na nuvem.

---

## O que já está forte (não recomeçar do zero)

| Área | Evidência no repo |
|------|-------------------|
| **Isolamento por CNPJ** | `hb-staff-gestao-lkg-v1`, persist por CNPJ, nunca grava blob global |
| **Contratos travados** | Conferir entregas, Pagar cooperados, Corrigir, troca de abas rápida |
| **Atualizar não zera** | v497, v498, snapshot gestão |
| **Paridade R$** | Painel × Em aberto × Pagar (v500, em-aberto-paridade) |
| **Live sync leve** | Poll notas + tick sem `operacional_full` em rajada |
| **Primeiro dia** | Redirect Contratos só se vazio |

Gates técnicos:

```powershell
npm run responsavel:verify:lancamento   # núcleo (obrigatório antes de cada entrega staff)
npm run responsavel:verify:fase-r       # lançamento + desempenho U4 + homolog nuvem read-only
```

Experiência única (doc): `docs/plano-mestre/RESPONSAVEL-EXPERIENCIA-UNICA-E-LANCAMENTO.md`  
Checklist humano: `docs/plano-mestre/FASE-R-RESPONSAVEL-CHECKLIST.md`.

---

## Fases (portões SIM/NÃO)

### Fase R1 — Entrada e identidade

| # | Critério |
|---|----------|
| 1 | Login responsável → **painel gestão** (não cai no Início cooperado) |
| 2 | F5 / reabrir → menus e lastro sem tela branca prolongada |
| 3 | Troca de cooperativa (se houver) esvazia memória do tenant anterior |

**Contratos:** `test-responsavel-painel*`, `test-staff-gestao-f5*`, `test-staff-gestao-tenant-switch`.

---

### Fase R2 — Uso diário fluido

| # | Critério |
|---|----------|
| 1 | Trocar abas (Início, Notas, Ficha, Financeiro) 10× — UI responde |
| 2 | Keep-alive mobile staff (se usado) não congela |
| 3 | «Atualizar» não trava a fila inteira |

**Contratos:** `test-responsavel-troca-abas-rapida`, `test-staff-mobile-tab-keep-alive-u4`.

---

### Fase R3 — Fluxo do dia (conferir → lançar → pagar)

| # | Critério |
|---|----------|
| 1 | **Conferir entregas** — nota só sai da fila após ação correta |
| 2 | **Em aberto / Pagar** — mesmo cooperado, mesmo valor (centavos) |
| 3 | **Correções** — não liquidar indevido; bloqueio em pago/PIX |

**Contratos:** preservar-app (3 scripts responsável) + `test-responsavel-em-aberto-pagar-paridade`.

**Doc:** `docs/FILA-RESPONSAVEL-VS-FINANCEIRO.md` (conferir ≠ pagar).

---

### Fase R4 — Valores e nuvem (gestão)

| # | Critério |
|---|----------|
| 1 | Painel **A pagar** = relatório em aberto (audit read-only) |
| 2 | Lançamento na gestão → revisão na nuvem muda (cooperado vê após sync — build 645+) |
| 3 | **Atualizar** 1× — fichas/pagamentos **não somem** |

**Contratos:** `test-staff-valores-reais-paridade-v500`, `test-staff-gestao-atualizar-nao-zera-v497`, cold-hydrate pull.

---

### Fase R5 — Homologação de lançamento (ponta a ponta)

| # | Critério |
|---|----------|
| 1 | Responsável confere + lança → cooperado vê valor (~2 min ou Atualizar 1× no cooperado) |
| 2 | Pagamento registrado → cooperado reflete status correto |
| 3 | Repetir em **celular** e **desktop** do responsável |

**Portão:** *“Responsável pronto para lançamento?”* — **SIM** / **NÃO**.

---

## Estratégia (mesma linha do cooperado)

1. **Um produto GA** — não ramo por e-mail; exceções só em diagnóstico.
2. **Event-driven na nuvem** — responsável grava na nuvem; cooperado puxa por revisão (645+).
3. **Staff nunca mistura tenants** — LKG + persist por CNPJ (lei `OPERACAO-HB-PLATAFORMA`).
4. **Correção cirúrgica** — bump de contrato (`RESPONSAVEL_*_VERSION`) + teste; sem rollback gigante.
5. **HB Crédito / mercado** — escopo **R6** separado após R5 **SIM** (não bloquear lançamento do núcleo).

---

## Registro de portões

| Fase | Data | Resposta | Build |
|------|------|----------|-------|
| Plano aceito | 24/10/2026 | SIM (agente) | 646 |
| Onda perf abas (651) | 24/10/2026 | deploy agente | 651 |
| R1 | | | |
| R2 | | | |
| R3 | | | |
| R4 | | | |
| R5 | | | |

---

## Próxima ação (agente)

1. Manter `responsavel:verify:fase-r` verde a cada entrega staff (**não alterar cooperado**).
2. Você homologa **R1→R5** (`FASE-R-RESPONSAVEL-CHECKLIST.md`); agente corrige só gestão com base em SIM/NÃO.
3. Portão **R5 SIM** = lançamento público do par responsável↔cooperado (cooperado já em 645+).
