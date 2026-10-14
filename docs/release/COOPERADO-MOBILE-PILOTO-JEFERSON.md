# Piloto mobile cooperado — Jeferson

**Vigência:** a partir de out/2026.  
**Princípio:** nenhuma mudança de comportamento mobile cooperado (abas, PWA, cache, perf UI) vai para **todos** os cooperados sem passar pelo piloto.

## Quem é o piloto

| Campo | Valor |
|--------|--------|
| Nome | Jeferson Abreu de Aguiar |
| E-mail | `jefersonabreudeaguiar@gmail.com` |
| `cooperadoId` | `c_1781981564381_w67gg` |

Código: `isCooperadoMobilePilot()` em `src/lib/cooperado/cooperadoMobilePilot.ts`.  
Performance piloto: `src/lib/cooperado/cooperadoMobilePilotPerf.ts` — checklist em `docs/release/COOPERADO-MOBILE-PILOTO-JEFERSON-PERF-CHECKLIST.md`.  
**Estrela amarela** no header (só Jeferson): `cooperadoMobilePilotIndicator.ts` — visível enquanto `PENDING_REVISION > PROMOTED_REVISION`.

## Fluxo obrigatório

1. **Implementar** a mudança só no ramo piloto (`isCooperadoMobilePilot` / `cooperadoMobilePilotOrDefault`).
2. **Deploy** em produção — só o Jeferson vê o novo comportamento no PWA cooperado.
3. **Validar** no celular do Jeferson (checklist curto por feature).
4. **Aprovação explícita** (“piloto OK” / “promover para GA”).
5. **Promover:** remover o `if` piloto ou unificar no valor `production` — **um commit** de generalização.
6. **Opcional:** remover código legado após uma release estável.

## O que não fazer

- Mudar `layout.tsx`, `sw.js` ou scripts globais do `<head>` para todos sem plano de preview.
- Alterar API/Supabase que mude dado para todos enquanto só a UI está em piloto (salvo combinação explícita).
- Expandir comportamento piloto para outros cooperados sem commit de promoção.

## Referências no repo

- Homolog perf (Orlando): `canUseRqlPerfHomologPanel`
- Reparo pontual (Agenor): `cooperadoForcedProfileCacheRepair`
- Regra Cursor: `.cursor/rules/cooperado-mobile-pilot-jeferson.mdc`
