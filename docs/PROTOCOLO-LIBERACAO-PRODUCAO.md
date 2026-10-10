# Protocolo anti-deploy fantasma

Cada liberação em produção deve deixar rastro verificável. **Commit no GitHub ≠ app no ar.**

## Checklist obrigatório

| # | Controle | Como obter evidência |
|---|----------|---------------------|
| 1 | Estado inicial | `git status -sb`, `git rev-parse HEAD origin/main` |
| 2 | Testes | `npm run release:verify:fast` (ou escopo mínimo do diff) |
| 3 | Commit / push | `git log -1 --oneline`, push sem erro |
| 4 | Deploy | Vercel dashboard ou aguardar build automático |
| 5 | Identidade | `npm run verify:production-identity` |
| 6 | Runtime | `curl -s https://hbcooperativas.vercel.app/api/client-release` |
| 7 | Smoke uso | `/login`, fluxo tocado (cooperado ou responsável) |
| 8 | Dados | **Sem** scripts wipe/reset/migration destrutiva sem runbook |
| 9 | Encerramento | Atualizar `MASTER-PLAN-CONTINUIDADE.md` |

## Quando bloquear “entregue”

- `verify:production-identity` falha (build ou SHA divergente).
- Smoke de login ou API crítica falha.
- Mudança financeira sem homologação mínima (1 cooperado + 1 responsável nos fluxos tocados).

## Rollback

| Tipo | Ação |
|------|------|
| Código / UI | Vercel promote deployment anterior **ou** `git checkout baseline/build-248` + redeploy autorizado |
| PWA cache | Cooperado pode precisar atualizar app / build banner |
| Banco / pagamentos | **Não** `git revert` cego — seguir runbooks (`RUNBOOK-POS-PAGAMENTOS.md`, repairs documentados) |

## PWA

Se mudou UI/fluxo/cache percebido pelo cooperado:

1. Incrementar `APP_BUILD_VERSION` e `CACHE_VERSION` em `public/sw.js`.
2. Confirmar build novo em `client-release` após deploy.

## Referência

Manifesto do baseline atual: `docs/baselines/build-248-manifest.json`.
