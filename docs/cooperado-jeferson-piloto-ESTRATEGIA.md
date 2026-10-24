# Estratégia — Cooperado financeiro (piloto Jeferson)

## Princípio

1. **Um problema por vez** — responsável (`/conta-coop`) congelado até o piloto cooperado fechar.
2. **Piloto fechado** — só a conta **Jeferson** (`isCooperadoMobilePilot`) usa o leitor unificado.
3. **Demais cooperados** — ramo GA estável já em produção; sem resolver unificado nem sync experimental.
4. **Promover** — quando o checklist do piloto passar 100%, trocar o gate de `isCooperadoMobilePilot` para `isCooperadoMobileGaPromoted` (um commit, um teste).

## Fonte de verdade (piloto)

| Camada | O quê |
|--------|--------|
| AppData após sync | Notas, ficha, pagamentos |
| Motor | `cooperadoLeituraFinanceiraExibicao` + HB híbrido |
| UI Início + Financeiro | **Mesmo** `useCooperadoParidadeExibicaoJeferson` |

Gate único: `cooperadoJefersonPilotoFinanceiroAtivo(user)` → `isCooperadoMobilePilot(user)`.

## Fases

### Fase 0 — Hoje (build 630+)

- [x] Gate piloto só Jeferson (`cooperadoInicioSincronizadoComFinanceiro` = piloto).
- [x] Hook único `useCooperadoParidadeExibicaoJeferson`.
- [x] Fallback legado se paridade `null` (sem tela branca).
- [ ] Jeferson valida: Início = Financeiro após **Atualizar**.
- [ ] Jeferson valida: valor = responsável/desktop após sync completo.

### Fase 1 — Piloto “pronto”

- Checklist automatizado: `npm run test:cooperado-jeferson-piloto`.
- Zero regressão em contrato responsável.
- Expandir gate para todos os cooperados GA (commit explícito + release note).

## O que NÃO fazer no piloto

- Reativar `COOPERADO_EXIBICAO_FINANCEIRA_UNIFICADA_AO_VIVO` sem SIM.
- Mexer em `ContaCoopContent`, sync responsável, ou build conta-coop sem tarefa separada.
- Dois motores diferentes no Início (persistido vs live) para Jeferson — só o hook + lastro anti-zero.

## Comandos

```bash
npx tsx scripts/test-cooperado-jeferson-piloto-isolamento.ts
npx tsx scripts/test-cooperado-mobile-valor-paridade-contrato.ts
npm run confirm:production:wait
```
