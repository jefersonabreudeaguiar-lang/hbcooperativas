# HB Cooperativas — Continuidade do Plano Mestre

Documento vivo. Atualizar ao fim de cada etapa importante e antes de trocar de chat.

## Objetivo maior

Profissionalizar o HB Coop para expansão multicooperativa sem perder integridade de dados, fluxos financeiros nem confiança operacional.

## Progresso por fase (evidência, não estimativa vaga)

| Fase | Nome | Estado | Evidência |
|------|------|--------|-----------|
| 0 | Diagnóstico e proteção | **Em andamento** (~45% Fase 0) | Este doc, `FASE-0-LINHA-BASE.md`, tag `baseline/build-248`, build **251** em prod |
| 0.2 | AUTH_SECRET fora do Git | **Adiado** (decisão operador) | Risco documentado; segredo permanece em `vercel.json` até retomar |
| 1 | Pipeline commit → produção | **Iniciado** (~10%) | `verify-production-identity`, `PROTOCOLO-LIBERACAO-PRODUCAO.md` |
| P | **Paridade cooperado** (mesmo build + mesmos valores) | **Em andamento** | Build 255: snapshots estritos, banner atualização, shield em todas abas PWA |
| 2–7 | SSOT, conformidade, perf, segurança, resiliência, expansão | **Não iniciado** | — |

**PROGRESSO global estimado do plano mestre:** ~8% (Fase 0 parcial + ferramentas Fase 1).

## Estado comprovado (2026-10-10)

| Item | Valor |
|------|--------|
| Repositório | `jefersonabreudeaguiar-lang/hbcooperativas` |
| Branch | `main` |
| `HEAD` / `origin/main` | `ce9ae8291761c5ed6fe8fcc7ba2352519d3d4a9a` |
| Produção `client-release` | build **251**, SHA `ce9ae82…`, `dpl_BfrJdhu6Xi5oMbMeURps1yscNfLB` |
| Rollback de código (tag) | `baseline/build-248` → `3a8ac34` (anterior a PWA/entregas 249–251) |
| Smoke browser | `/login` OK (formulário Entrar) |
| `verify:production-identity` | OK (build repo = build live) |

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

- **251** — Entregas: atalho **Anexar foto** abre modal/câmera antes do sync PWA; sync de envio em background (`ce9ae82`).
- **250** — PWA: failsafe do boot shell no preview (`a12dbe0`).
- **249** — PWA: remove boot shell preso na tela branca ao carregar (`dad45a0`).
- **248** — Modal fotos / enviar ao responsável no celular (`3a8ac34`).
- **247** — Liquidação mercado / recebíveis elegíveis (`27e31aa`).

## Paridade cooperado (ordem de correção)

1. **Início** — build único, card “A receber” sem snapshot de build antigo; banner “Atualizar agora”.
2. **Financeiro / recibo** — mesma regra de snapshot + UI (modal assinatura build 254+).
3. **Entregas** — performance + mesma versão (build 252+).
4. **Dados** — operacional/BIC: uma fonte na nuvem; `Atualizar` obrigatório após deploy (manual sync já ativo).

## Próxima ação autorizada (ao acordar)

1. **Paridade P:** validar início com 2+ cooperados após build 255; seguir para Financeiro.
2. **Fase 0 (restante):** inventário módulos em `FASE-0-LINHA-BASE.md` — revisar com humano.
3. **Fase 0.2:** retomar só quando operador autorizar (AUTH_SECRET fora do Git).
4. **Fase 1:** integrar `npm run verify:production-identity` no checklist pós-push (e opcionalmente GitHub Action read-only).

## Comandos úteis

```bash
npm run verify:production-identity
npm run release:verify:fast   # gate local (pode falhar sem env oficial)
git show baseline/build-248 --no-patch
```

## Filosofia

Ver `docs/FILOSOFIA-PRODUCAO.md` e seção 1 do Plano Mestre (dados = patrimônio; commit ≠ deploy).
