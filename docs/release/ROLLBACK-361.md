# Ponto de retorno — release/361

**Tag Git:** `release/361`  
**Commit:** `f21ff892c8a81b2437b6416b917a0aabd975a9ed`  
**Data:** 2026-10-13  
**Estado:** Produção após hotfix do gate no `AppLayout`; perf L0/L1 parcial (sem LiveRoot no Início).

## Quando usar

O cooperado ou a equipe pediu **“volte para o 361”** — restaurar exatamente este snapshot (antes do fechamento cirúrgico de performance do Início L1).

## Comandos (maintainer)

```bash
cd coopeagriplla-gestao
git fetch origin tag release/361
git checkout release/361
# ou, na main, reset duro (cuidado):
# git reset --hard release/361
```

Deploy: após checkout/reset, push conforme política da equipe e rodar `npm run confirm:production:wait -- --expect-sha f21ff892`.

## O que este ponto **não** inclui

- `CooperadoInicioCooperadoLiveRoot` ligado ao `DashboardContent`
- Changelog cooperado com bullets de performance do fechamento
- Política DOM `361-inicio-live-l1` (pós-fechamento)

Commits **após** esta tag implementam o fechamento de perf; revertendo a tag volta ao comportamento “361 como estava”.
