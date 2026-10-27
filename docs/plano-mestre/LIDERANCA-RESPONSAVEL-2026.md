# Liderança do app responsável (gestão) — plano de lançamento

**Marco zero (norte do programa):** [`MARCO-ZERO-PROGRAMA-2026.md`](./MARCO-ZERO-PROGRAMA-2026.md)

**Responsável técnico:** agente · **Produção:** https://hbcooperativas.vercel.app  
**Build live (27/10/2026):** **725** (gestão 724 hidratação; 725 PWA cooperado entrada)  
**Papel do operador (você):** validar **SIM/NÃO** por aba no celular **e** no desktop — mesmo modelo do cooperado.

**Regra de ouro:** não mexer no fluxo **cooperado** enquanto estabilizamos a gestão; cada entrega = gate `responsavel:verify:lancamento` + `confirm:production:wait`.

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
5. **HB Crédito V2** — escopo **R6** após R5 **SIM**; paridade responsável × cooperado: [`V2-HB-PARIDADE-RESPONSAVEL-COOPERADO.md`](./V2-HB-PARIDADE-RESPONSAVEL-COOPERADO.md).

---

## Registro de portões

| Fase | Data | Resposta | Build |
|------|------|----------|-------|
| Plano aceito | 24/10/2026 | SIM (agente) | 646 |
| Onda perf abas (651) | 24/10/2026 | deploy agente | 651 |
| PC nav nativo (654) | 25/10/2026 | deploy agente | 654 |
| R1 | | | |
| R2 | | | |
| R3 | | | |
| R4 | | | |
| R5 | | | |

---

## Método PC (trilhas T1→T3)

Ver **`METODO-GESTAO-PC-2026.md`**: perfil único `staffGestaoPerfilDesktop` (contrato versionado), diagnóstico F12 com chave `coopeagriplla_data:CNPJ`, **T1 estável antes de T2 (dados/F5)**.

## Plano por aba (execução passo a passo — out/2026)

Ordem de trabalho alinhada ao menu do responsável (`permissions/index.ts`). Cada passo: **(1)** agente corrige + gates + deploy · **(2)** você homologa SIM/NÃO · **(3)** só então próxima aba.

| Passo | Aba / rota | Fases | Objetivo | Você valida (SIM/NÃO) |
|-------|------------|-------|----------|------------------------|
| **0** | Fundação | R1 | Login → painel gestão; F5 sem tela branca; 1º sync/sessão (anônimo + Chrome normal); persist `coopeagriplla_data:CNPJ` | Entra, não trava, build 721+ |
| **1** | **Início** `/dashboard` | R1+R4 | Card **A pagar** ≈ nuvem; fila do dia; cooperados ativos; «Atualizar totais…» some após sync | R$ ~41k CoopeagriPla (ou audit); sem R$ 0 fixo |
| **2** | **Conferir** `/notas-pedido` | R2+R3 | Fila = notas reais; conferir/corrigir; badge contagem; PC: Atualizar na tela | Fila 24 ≈ audit; ação não some nota errada |
| **3** | **Pagar** `/ficha-corrida` (staff) | R3+R4 | Em aberto × Pagar × Início (mesmo R$); mês com PIX não reabre; lançar pós-PIX | Paridade por cooperado; gate `em-aberto-pagar-paridade` |
| **4** | **Livro caixa** `/livro-caixa` | R4 | Reconciliar só nesta rota no PC; sem loop no Início | Abre, lista, não trava Chrome |
| **5** | **Cooperados** `/cooperados` | R2 | Lista, cadastro, assinatura/app | Nomes e contagens batem |
| **6** | **Relatórios** `/relatorios` | R4 | Em aberto / totais = painel | Mesmo total do Início |
| **7** | **Contratos + Comunicados + Votações** | R2 | Primeiro dia; rotinas secundárias | Só se núcleo 1–3 SIM |
| **8** | **HB Créditos** `/conta-coop` | R6 | Fora do portão R5 | Após R5 SIM |

**Arquivos âncora por aba:** `DashboardContent` (Início), `NotasPedidoStaffResponsavelApp` (Conferir), `FichaCorridaContent` + `responsavelPainelIndex` (Pagar), `staffGestaoPerfilDesktop` (PC vs mobile).

**Dívida técnica conhecida (passo 0/3):** `npm run responsavel:verify:lancamento` falhou em 26/10 — caso *mês pago + fichaIds antigos* (`test-responsavel-panel-access-etapa622`). Corrigir no **passo 3 (Pagar)** antes de fechar R3.

---

## Próxima ação (agente)

1. **Passo 0** — fechar R1 no build atual (entrada + sync + documentar limpeza de cache Chrome se preciso).
2. **Passo 1** — Início: totais estáveis após abertura e após «Atualizar» (desktop + anônimo).
3. Manter `responsavel:verify:lancamento` verde a cada entrega staff (**não alterar cooperado**).
4. Você responde **SIM/NÃO** por passo; agente só avança de aba com seu SIM no passo anterior.
5. Portão **R5 SIM** = lançamento público do par responsável↔cooperado (cooperado já em 645+).
