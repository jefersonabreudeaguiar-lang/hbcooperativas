# Criar o projeto Vercel do laboratório (autorizado)

O app **oficial** (`hbcooperativas.vercel.app`) permanece no projeto atual. O **lab** é um **segundo projeto** na mesma conta/equipe Vercel.

## 1. Novo projeto (dashboard)

1. Acesse [vercel.com/new](https://vercel.com/new) com a **mesma conta/equipe** do HB oficial.
2. **Import Git Repository** → `jefersonabreudeaguiar-lang/hbcooperativas`.
3. **Project Name:** `hbcooperativas-lab` (ou `hb-coop-lab`).
4. **Framework:** Next.js (detectado).
5. **Root Directory:** `.` (raiz do repo `coopeagriplla-gestao` se o monorepo apontar subpasta, ajuste).
6. **Production Branch:** `hb-cooperativas-lab` (não use `main` neste projeto).
7. **Não** copie as env de produção do projeto oficial — use a lista abaixo.

## 2. Environment Variables (projeto **lab** apenas)

Copie de [`env-homolog-vercel.template`](./env-homolog-vercel.template) e preencha com os valores de `.env.homolog.local` (Supabase homolog `ocyfz…`):

| Variável | Valor |
|----------|--------|
| `APP_ENV` | `homolog` |
| `BIC_ENVIRONMENT` | `HOMOLOG` |
| `NEXT_PUBLIC_APP_URL` | `https://hbcooperativas-lab.vercel.app` (ajuste após 1º deploy) |
| `NEXT_PUBLIC_SUPABASE_URL` | homolog |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | homolog |
| `SUPABASE_SERVICE_ROLE_KEY` | homolog |
| `AUTH_SECRET` | homolog |
| `HB_CREDIT_ENABLED` | `true` |
| `NEXT_PUBLIC_HB_CREDIT_ENABLED` | `true` |
| `HB_CREDIT_OPERATIONS_ENABLED` | `true` |
| `NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC` | `1` |
| `NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC` | `1` |
| `NEXT_PUBLIC_HB_BIC_PRODUCTION_LOCK` | `false` |
| `NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL` | `false` |
| `NEXT_PUBLIC_BIC_CENTRAL_READ_FULL_OFFICIAL` | `false` |

**Importante:** depois do primeiro deploy, volte em **Settings → Environment Variables** e corrija `NEXT_PUBLIC_APP_URL` para a URL real do lab (com `https://`).

## 3. GitHub Actions (deploy automático na branch `homolog`)

No repositório GitHub → **Settings → Secrets and variables → Actions**, crie:

| Secret | Onde obter |
|--------|------------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel → Team Settings → **Team ID** (ou User ID se projeto pessoal) |
| `VERCEL_PROJECT_ID_HOMOLOG` | Projeto `hbcooperativas-lab` → Settings → **Project ID** |

Crie o workflow a partir de [`homolog-vercel-deploy.workflow.yml`](./homolog-vercel-deploy.workflow.yml) em `.github/workflows/homolog-vercel-deploy.yml` (GitHub exige escopo **workflow** no token de push). Cada push em `hb-cooperativas-lab` dispara esse workflow.

## 4. CLI (opcional — conta com acesso à equipe)

Se `npx vercel project ls` falhar com “No teams”, faça login na conta que administra o HB oficial:

```bash
npx vercel login
npx vercel link --project hbcooperativas-lab
```

Env em lote (PowerShell, na pasta do app):

```powershell
.\scripts\sync-homolog-vercel-env.ps1 -ProjectName hbcooperativas-lab
```

## 5. Validar

```bash
git push origin hb-cooperativas-lab
# após deploy
HOMOLOG_APP_URL=https://hbcooperativas-lab.vercel.app npm run confirm:homolog
```

No celular: abra a URL do lab → login cooperado de teste → **Instalar app** → ícone **HB Lab** (separado do oficial).

## 6. Liberar para o oficial

Merge `homolog` → `main` quando os testes passarem → deploy só no projeto **hbcooperativas** (branch `main`) → `npm run confirm:production:wait`.
