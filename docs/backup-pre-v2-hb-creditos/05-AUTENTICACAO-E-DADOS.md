# Autenticação e dados — preservar na V2

## Login

| Peça | Arquivo / rota |
|------|----------------|
| Página | `src/app/login/page.tsx` |
| API | `src/app/api/auth/login/route.ts` (e relacionadas) |
| Provider | `src/modules/auth/AuthProvider.tsx` |
| JWT | `src/lib/security/jwt.ts`, cookie `hb_session` |
| Sessão local | `src/services/dataStore.ts` → `coopeagriplla_session` |
| Guards | `GuestRoute`, `ProtectedRoute` |

**Requisito V2:** nenhuma migração de senha; mesmos registros `app_users`.

## Cadastro cooperado / responsável

- `src/app/cadastro/page.tsx`
- Fluxos PIX/cadastro cooperado se ainda usados — revisar antes de apagar.

## Sync operacional (AppData)

- `CooperativaSyncProvider` — grande parte do app legado.
- **V2 HB-only:** pode reduzir a sync mínima (perfil + HB account), não wipe de `app_users`.

## O que pode ficar só na nuvem (sem AppData pesado)

- Limites e transações HB (`/api/credit/*`).
- Lista cooperados (`cooperados` no operacional ou tabela dedicada).

## Backup de dados antes de cortar código

Scripts recomendados (já no repo):

- `npm run` scripts de audit/backup em `docs/RUNBOOK-POS-PAGAMENTOS.md`
- `backup:cloud` se configurado
- Export Supabase: `hb_credit_*`, `app_users` (cooperativa alvo)

## PWA

Manifest, `pwa-launch`, guards PWA — **reconfigurar na Fase 4 V2** para `start_url` HB; auth inalterada.
