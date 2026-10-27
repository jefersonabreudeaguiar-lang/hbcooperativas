# Plano de remoção — após backup (checklist)

Execute **somente** após:

- [ ] Esta pasta revisada
- [ ] `git tag backup/pre-v2-full-app` no commit atual
- [ ] Backup Supabase (app_users + hb_credit_*)
- [ ] Homologação escrita: “só HB” aprovada pela cooperativa

## Fase 1 — Menus e redirects (sem apagar arquivos)

- [ ] `NEXT_PUBLIC_V2_HB_ONLY=1` em `src/lib/featureFlags` (criar se não existir)
- [ ] `permissions/index.ts`: cooperado → menu só `/minha-conta-coop`; bottom tab única ou HB + perfil
- [ ] Responsável → `RESPONSAVEL_HREFS` = `['/conta-coop','/cooperados','/meu-perfil']`
- [ ] `middleware` ou `page.tsx` redirect `/dashboard` conforme papel
- [ ] Testes: login cooperado, login responsável, pagar QR

## Fase 2 — Valor bruto manual

- [ ] UI em `/cooperados` ou aba em conta-coop
- [ ] API PATCH + migration SQL
- [ ] `creditBaseAuthoritative` lê manual primeiro
- [ ] Desligar projeção ficha quando manual setado

## Fase 3 — Remoção de rotas (opcional delete físico)

Pastas candidatas a **arquivar** (mover para `archived/pre-v2/` em vez de delete):

- `src/app/(app)/notas-pedido`
- `src/app/(app)/ficha-corrida`
- `src/app/(app)/precos`
- `src/app/(app)/livro-caixa`
- `src/app/(app)/fechamento-mensal`
- Componentes BIC / cooperado início pesado

**Manter:**

- `src/app/(app)/minha-conta-coop/**`
- `src/app/(app)/conta-coop/**`
- `src/app/(app)/cooperados/**`
- `src/modules/hb-credit/**`
- `src/app/api/credit/**`
- Auth, layout mínimo, PWA essencial

## Fase 4 — Limpeza dependências

- [ ] Remover imports mortos de `AppLayout`
- [ ] Ajustar `release:verify` / testes legado
- [ ] `APP_BUILD_VERSION` + deploy + `confirm:production:wait`

## Rollback

- Checkout tag `backup/pre-v2-full-app`
- Ou `NEXT_PUBLIC_V2_HB_ONLY=0`
