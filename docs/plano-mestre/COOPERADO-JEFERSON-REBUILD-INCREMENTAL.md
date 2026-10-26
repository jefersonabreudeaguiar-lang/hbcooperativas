# Cooperado v1 — reconstrução incremental (piloto Jeferson)

**Objetivo:** manter **mesma UI/UX** (header, abas inferiores, cards, cores, rotas `/dashboard`, `/notas-pedido`, `/precos`, `/ficha-corrida`). Trocar só a **lógica por baixo**, aba a aba, sem apagar dados na nuvem.

**Fase 0 (build ≥703):** casca zerada nas abas ainda não refeitas.

**Fase 1 — Início (build ≥704):** Jeferson — card «A receber» via `/api/cooperado-pilot/inicio-card` (nuvem, escopo `inicio` sem notas); Atualizar no header chama `/api/cooperado-pilot/atualizar-inicio`.

**Fase 2 — Entregas (build ≥705):** Jeferson — lista via `/api/cooperado-pilot/entregas-resumo` (nuvem `full`, snapshot no servidor); cache `sessionStorage`; Atualizar → `/api/cooperado-pilot/atualizar-entregas`. Envio de fotos ainda não no piloto. Preços e Financeiro continuam zerados.

**Piloto:** apenas Jeferson (`c_1781981564381_w67gg` / `jefersonabreudeaguiar@gmail.com`) — gate `isCooperadoMobilePilot`.  
**Produção oficial:** Orlando e demais cooperados **não entram** até cada aba ter SIM de homologação e promoção explícita.

## Por que dá certo (e o v2 não resolveu)

| Item | Rebuild v1 (este plano) | Piloto v2 (removido) |
|------|-------------------------|----------------------|
| Aparência | Mesmas rotas e componentes visuais | Rotas novas, UX diferente |
| PWA / atalho | Continua `/dashboard` | Link separado |
| Promoção | Liga aba no flag → depois GA | Redirect de todo o app |

## O que “zerar aba” significa

- **Não** apaga `operacional`, notas nem `localStorage` na nuvem.
- **Sim:** na sessão Jeferson, a aba **não monta** views pesadas (motor BIC completo, listas gigantes, sync na abertura).
- Mostra **casca** igual (título, card vazio/skeleton, botão Atualizar quando fizer sentido).
- `CooperativaSyncProvider` / `CooperadoFinanceiroGate`: para Jeferson em modo rebuild, **sync só no Atualizar** (ou API dedicada por aba).

## Ordem sugerida

1. **Início** (`/dashboard`) — Olá + “A receber” (fonte única, leve).
2. **Entregas** (`/notas-pedido`) — lista mínima da nuvem.
3. **Preços** (`/precos`).
4. **Financeiro** (`/ficha-corrida`).

Cada fase: implementar → testar no aparelho Jeferson → SIM/NÃO → só então incluir a aba em `COOPERADO_JEFERSON_REBUILD_TABS_HABILITADAS`.

## Promoção para app oficial

1. Aba estável no piloto Jeferson (3 critérios: abre rápido, Atualizar não trava, valor alinhado à cooperativa quando aplicável).
2. Remover o “zerado” só dessa aba para **todos** os cooperados GA (ou substituir implementação antiga pela nova no mesmo componente).
3. Repetir por aba — sem big-bang.

## Código (contrato)

- `src/lib/cooperado/cooperadoJefersonRebuildPilot.ts` — modo rebuild + lista de abas habilitadas.
- Placeholder visual: `CooperadoJefersonRebuildTabCorpo.tsx` (mesmo spacing/Card do app).
- Teste: `scripts/test-cooperado-jeferson-rebuild-gate.ts`.

## Rollback

- Desligar modo rebuild no piloto (flag no módulo) → Jeferson volta ao comportamento GA atual.
- Tag/git conforme releases cooperado em `docs/changelog/cooperado-por-build.md`.
