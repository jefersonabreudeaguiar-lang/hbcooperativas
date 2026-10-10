# Fase 0 — Linha de base (somente leitura)

Gerado no início do Plano Mestre. **Não altera dados de produção.**

## 1. Produção verificável

| Controle | Evidência |
|----------|-----------|
| URL | https://hbcooperativas.vercel.app |
| Build PWA | 248 (`src/lib/appBuildVersion.ts`, `public/sw.js`) |
| Commit publicado | `3a8ac34671d8fc5c2210caa3a1d7f494fac54afe` |
| Deployment | `dpl_6kQfqfb34TNAa8JtBjxoJfCidqem` |
| API identidade | `GET /api/client-release` |

## 2. Git

- Remote: `https://github.com/jefersonabreudeaguiar-lang/hbcooperativas.git`
- Branch de trabalho: `main` alinhada a `origin/main` no baseline.
- Tag de restauração: `baseline/build-248` (annotated).
- Branch de backup: `backup/baseline-build-248`.

## 3. Módulos principais (mapa rápido)

| Área | Código / doc |
|------|----------------|
| App shell, PWA, release shield | `src/app/layout.tsx`, `src/lib/pwa/`, `public/sw.js` |
| Auth / JWT | `src/lib/security/`, `src/middleware.ts` |
| Notas / entregas / fotos | `src/app/(app)/notas-pedido/`, `src/utils/fotoEntrega.ts` |
| Conferência responsável | `src/lib/conferencia/`, staff notas |
| Ficha / pagamentos | `src/app/(app)/ficha-corrida/` |
| HB Crédito / mercado | `src/modules/hb-credit/`, `contaCoopStorage.ts` |
| BIC / paridade | `src/modules/bic/`, flags em `vercel.json` |
| Nuvem | Supabase (`operacional.json`, storage buckets), `src/lib/supabase/` |
| Release gate | `npm run release:verify`, `docs/FILOSOFIA-PRODUCAO.md` |

## 4. Ambientes

| Ambiente | Notas |
|----------|--------|
| Produção | Vercel + Supabase prod (ref documentado em exemplos `.env.production-official.example`) |
| Local | `.env.local` — **nunca commitar** |
| Homolog / lab | `.env.homolog.local`, scripts `scripts/lab/*` |

## 5. Testes e CI

- CI remoto: `.github/workflows/hb-valor-receber.yml` (subconjunto).
- Gate local: `release:verify:fast` (13 passos; env oficial opcional).
- Workflow `perf-fluxos-gate.yml` existe só local (push bloqueado por scope `workflow`).

## 6. Defeitos / débitos conhecidos (sem suposição de fix)

1. Segredo JWT em `vercel.json` (Fase 0.2).
2. Gate `test-cooperado-inicio-card-policy` falha em ambiente dev sem flags BIC oficiais.
3. Arquivos monolíticos de notas-pedido (manutenção difícil).
4. Grande volume de scripts `_once` locais (não são produto).

## 7. Performance — linha de base qualitativa

- Documentação: `docs/performance-rql.md`, ondas 2.x em `docs/performance-*`.
- Medição formal RQL: registrar na Fase 4; hoje baseline = build 248 + percepção campo (fotos/sync).

## 8. Critério de aprovação Fase 0

- [x] Commit e deploy de produção identificados e reproduzíveis.
- [x] Backup de código (tag + branch + manifest).
- [x] Inventário inicial e riscos documentados.
- [ ] AUTH_SECRET removido do Git com env Vercel (0.2B).
- [ ] Backup nuvem opcional executado pelo operador (`npm run backup:cloud`) se desejado.

Quando todos os itens estiverem marcados, Fase 0 pode ser declarada **concluída** em `MASTER-PLAN-CONTINUIDADE.md`.
