# Checklist performance — piloto Jeferson (pré-GA)

**Política DOM:** `pilot-jeferson-perf-1` (`data-cooperado-pilot-perf=1` no `<html>`).

## Antes de promover para todos

1. **Cold start** — abrir PWA/browser mobile logado como Jeferson: Início aparece com card “A receber” do snapshot (sem ficar em R$ 0 durante sync).
2. **Abas** — visitar as 4 abas uma vez; depois trocar entre elas: resposta imediata (sem tela branca).
3. **Início ↔ Financeiro ↔ Entregas** — com as três visitadas, Entregas não desmonta Início/Financeiro (troca rápida).
4. **Entregas** — lista do mês com várias entregas rola fluida (virtualização a partir de 8 itens/semana).
5. **Enviar foto** — após Enviar, entrega some da pendente; em até ~3 min ao voltar ao app puxa revisão (foreground stale piloto).
6. **Financeiro** — aba Financeiro ainda exige dados consistentes (sem atalho que zere valor indevido).
7. **Outro cooperado** — login com outro usuário: `data-cooperado-pilot-perf` ausente; comportamento igual ao GA anterior.

## Estrela amarela (header)

- Arquivo: `src/lib/cooperado/cooperadoMobilePilotIndicator.ts`
- **Nova rodada piloto:** aumentar `COOPERADO_MOBILE_PILOT_PENDING_REVISION` → Jeferson vê estrela ao lado de «HB Cooperativas».
- **Após GA:** `COOPERADO_MOBILE_PILOT_PROMOTED_REVISION = PENDING` → estrela some; todos no mesmo código.

## Promover para GA

1. Aprovação explícita (“piloto OK”).
2. Um commit: trocar `isCooperadoMobilePilot` por `true` / remover ramos ou unificar defaults em `cooperadoMobilePilotPerf.ts`.
3. Igualar `COOPERADO_MOBILE_PILOT_PROMOTED_REVISION` ao `PENDING` (estrela).
4. Remover `data-cooperado-pilot-perf` e política DOM piloto se unificada.

## Rollback rápido (só Jeferson)

Remover atributo no login (`applyCooperadoMobilePilotPerfDomFlag`) ou reverter commit do piloto perf.
