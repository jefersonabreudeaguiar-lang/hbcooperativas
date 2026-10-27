# Piloto Jeferson — app leve («só Atualizar»)

**Status:** piloto Jeferson — `COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON` (build ≥707). Orlando e demais: GA inalterado.

## Comportamento

| Área | Piloto Jeferson | Demais cooperados |
|------|-----------------|-------------------|
| Abertura / troca de abas | Sem sync operacional/financeiro automático, sem bootstrap pós-deploy, sem prefetch agressivo de abas | GA atual |
| Início + abas | **1ª entrada** leve; **2ª entrada** (≥30s) → sync automático; **Início** materializa primeiro; **Entregas / Preços / Financeiro** gravam snapshot **ao abrir a aba** (idle, sem travar troca). Sem botão Atualizar no piloto | GA atual |
| Entregas — fotos | Envio e sync de notas **na hora** (responsável vê na fila) | GA atual |
| AppData local | Parse adiado no cold start; **Atualizar** libera warm + sync base | GA atual |

## Código

- `src/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot.ts` — flag + gate de sync + janela `entrega`.
- `src/lib/cooperado/cooperadoJefersonAbasDadosReais.ts` — snapshots reais por aba (lazy).
- `src/lib/cooperado/cooperadoBicMaterializacaoPerf.ts` — BIC/snapshots em idle (ver `COOPERADO-BIC-MOBILE-PERFORMANCE.md`).
- Teste: `scripts/test-cooperado-jeferson-somente-atualizar-gate.ts`.

## Homologação (antes de GA para todos)

Só promover quando **todos** forem **SIM** no celular do Jeferson (build ≥713):

| # | Critério |
|---|----------|
| 1 | 1ª entrada: abas fluidas, sem travar |
| 2 | 2ª entrada (≥30s): sync automático termina sem congelar UI |
| 3 | Início: valor **A receber** correto (paridade com responsável/BIC) |
| 4 | Financeiro: ao abrir a aba, totais/meses corretos |
| 5 | Entregas: lista correta; **foto** chega na fila do responsável na hora |
| 6 | Preços: catálogo correto ao abrir a aba |

## Promoção produção (todos os cooperados no app)

**Gatilho:** você confirma homologação (“SIM para GA”).

**Mudança técnica (1 lugar):** em `cooperadoJefersonSomenteAtualizarPilot.ts`, trocar o escopo de `isCooperadoMobilePilot(user)` para **todo cooperado mobile GA** (ex.: `isCooperadoMobileGaPromoted(user)` + viewport celular), mantendo o mesmo fluxo (2ª entrada, abas lazy, sem botão Atualizar no header).

**Também ajustar:** `cooperadoJefersonSomenteAtualizarInlineHeadSkipAppDataWarmJs()` — skip de parse no cold start para **todos** cooperados (não só o id Jeferson).

**Deploy:** incrementar `APP_BUILD_VERSION` + `public/sw.js`; `npm run confirm:production:wait`.

**Orlando / outros:** passam a usar a mesma política do piloto; responsável e desktop **não** mudam.

## Rollback

- Piloto só: `COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON = false` → Jeferson volta ao GA com botão Atualizar.
- GA todos: reverter o escopo em `isCooperadoJefersonSomenteAtualizarPilot` para `isCooperadoMobilePilot` e o head skip só Jeferson.
