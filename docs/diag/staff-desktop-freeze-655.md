# Diagnóstico — gestão PC “página não responde” (build 654 → 655)

## Evidência produção (pré-correção)

| Item | Valor |
|------|--------|
| URL | https://hbcooperativas.vercel.app |
| `/api/client-release` | build **654**, `dpl_5sQnYnn1Nj7AGWaxR8fQsw7Y4ixZ`, SHA `255ec61a1c42` |
| HTML login | `data-app-build="654"` alinhado à API |
| Screenshot | `diag-pre-fix-build-654-login.png` (sessão Cursor) |

Relato homologação: **1 sim** (build visível), **2 não** (Conferir/Notas), **3 não** (Ficha/Pagar/troca), **página não responde** no PC.

## Causa comprovada no código (não suposição)

No **desktop**, três efeitos disparavam `scheduleStaffNavPrefetchEarly` ao login:

1. `CooperadoMobilePerfBootstrap` (staff, sem checar viewport)
2. `MobileNav` (staff, sem checar viewport)
3. `AppShellInner` (staff desktop)

Cada chamada, no mesmo frame / idle:

- `router.prefetch` de 5–9 rotas
- `prefetchStaffTabRouteChunks()` → **dynamic import** de `DashboardContent`, `FichaCorridaContent`, `LivroCaixaContent`, `ContaCoopContent`, `CooperadosContent` + bundle Conferir

**3×** essa carga na thread principal = menu lateral e Next Router bloqueados → Chrome “Wait / página não responde”, Conferir e Pagar parecem “travados”.

## Correção (build 655)

- `scheduleStaffNavPrefetchEarly` → **no-op fora do mobile** (`max-width: 1023px`).
- Novo `scheduleStaffNavPrefetchDesktop` → **um** prefetch leve das rotas do dia, adiado 1,4s, **sem** `prefetchStaffTabRouteChunks`.
- `CooperadoMobilePerfBootstrap` e `MobileNav` → prefetch staff só no mobile.
- `AppShellInner` desktop → só `scheduleStaffNavPrefetchDesktop`.

Contrato: `RESPONSAVEL_TROCA_ABAS_RAPIDA_VERSION = 3`.

## Verificação pós-deploy

1. Ctrl+F5 no PC → build **655** em login e `/api/client-release`.
2. Login responsável → sidebar: Início → Conferir → Pagar em &lt;2s sem diálogo “não responde”.
3. `npm run responsavel:verify:fase-r` verde no repo.
