# HB Cooperativas — Continuidade do Plano Mestre

Documento vivo. Atualizar ao fim de cada etapa importante e antes de trocar de chat.

## Objetivo maior

Profissionalizar o HB Coop para expansão multicooperativa sem perder integridade de dados, fluxos financeiros nem confiança operacional.

## Progresso por fase (evidência, não estimativa vaga)

| Fase | Nome | Estado | Evidência |
|------|------|--------|-----------|
| 0 | Diagnóstico e proteção | **Em andamento** (~40% Fase 0) | Este doc, `FASE-0-LINHA-BASE.md`, tag `baseline/build-248`, build 248 em prod |
| 0.2 | AUTH_SECRET fora do Git | **Pendente** | Diagnóstico 0.2A; Vercel sem `AUTH_SECRET` na lista informada |
| 1 | Pipeline commit → produção | **Iniciado** (~10%) | `verify-production-identity`, `PROTOCOLO-LIBERACAO-PRODUCAO.md` |
| 2–7 | SSOT, conformidade, perf, segurança, resiliência, expansão | **Não iniciado** | — |

**PROGRESSO global estimado do plano mestre:** ~8% (Fase 0 parcial + ferramentas Fase 1).

## Estado comprovado (2026-10-09)

| Item | Valor |
|------|--------|
| Repositório | `jefersonabreudeaguiar-lang/hbcooperativas` |
| Branch | `main` |
| `HEAD` / `origin/main` | `3a8ac34671d8fc5c2210caa3a1d7f494fac54afe` |
| Produção `client-release` | build **248**, SHA `3a8ac34…`, `dpl_6kQfqfb34TNAa8JtBjxoJfCidqem` |
| Smoke browser | `/login` OK (formulário Entrar) |

## Proteção do trabalho local (não commitar sem decisão)

- Modificados: `AppIdleSecondaryBootstraps.tsx`, `deferMainThreadWork.ts` (CRLF/WIP perf).
- Não rastreados: `.worktrees/`, `scripts/_once*`, `scripts/backups/*.json`, migrações SQL locais, `perf-fluxos-gate.yml`, etc.

## Riscos conhecidos

| Risco | Impacto | Mitigação planejada |
|-------|---------|---------------------|
| `AUTH_SECRET` em `vercel.json` versionado | Forja de JWT se vazado | Fase 0.2B após criar env no Vercel |
| `release:verify:fast` falha local (card policy / env oficial) | Falso negativo no gate local | `verify:production-identity` + CI futuro com env strict |
| God files (`NotasPedido*Main`) | Regressão em entregas | Diff cirúrgico; testes manuais pós-deploy |
| Dados reais só na nuvem | Rollback de código ≠ rollback de dados | Tag + manifest; `backup:cloud` opcional |

## Histórico recente (código em produção)

- **248** — Modal fotos / enviar ao responsável no celular (`3a8ac34`).
- **247** — Liquidação mercado / recebíveis elegíveis (`27e31aa`).

## Próxima ação autorizada (ao acordar)

1. **Fase 0 (restante):** inventário módulos em `FASE-0-LINHA-BASE.md` — revisar com humano.
2. **Fase 0.2B:** `AUTH_SECRET` no Vercel → remover de `vercel.json` → deploy → smoke login.
3. **Fase 1:** integrar `npm run verify:production-identity` no checklist pós-push (e opcionalmente GitHub Action read-only).

## Comandos úteis

```bash
npm run verify:production-identity
npm run release:verify:fast   # gate local (pode falhar sem env oficial)
git show baseline/build-248 --no-patch
```

## Filosofia

Ver `docs/FILOSOFIA-PRODUCAO.md` e seção 1 do Plano Mestre (dados = patrimônio; commit ≠ deploy).
