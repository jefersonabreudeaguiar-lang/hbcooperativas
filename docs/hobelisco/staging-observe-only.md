# Hobelisco — STAGING Observe-Only

Modo seguro: **observa, correlaciona e alerta — nunca bloqueia requests nem altera dados financeiros**.

## Variáveis (.env.local ou Vercel Preview)

```env
# Ambiente
HOBELISCO_ENVIRONMENT=STAGING

# Observer V2
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
HB_HOBELISCO_STAGING_ENABLED=true

# Supabase (mesmo projeto staging — NÃO produção financeira real sem revisão)
HB_HOBELISCO_STAGING_SUPABASE_URL=https://seu-projeto.supabase.co
HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY=sua_service_role_key

# Probe read-only (CNPJ cooperativa piloto)
HB_HOBELISCO_PROBE_COOP_CNPJ=62351750000165

# Manter DESLIGADO nesta fase
HB_HOBELISCO_CREDIT_WATCH_ENABLED=false
HOBELISCO_ACTIVE_DEFENSE_ENABLED=false
HB_HOBELISCO_WHATSAPP_ENABLED=false
```

## SQL (uma vez)

Aplicar manualmente no Supabase SQL Editor:

`lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql`

Verificar:

```bash
npm run lab:verify-hobelisco-v2-schema
```

## Ativar e validar

```bash
npm run hobelisco:staging:activate
```

## Monitorar

| Onde | URL |
|------|-----|
| Admin painel | `/admin` → seção Hobelisco |
| Health API | `GET /api/admin/hobelisco/staging-health` |
| Observer status | `GET /api/lab/hobelisco/v2` |

## O que observa (sem bloquear)

- Middleware: auth failures + API calls (`after()` async, fail-silent)
- Sync client: eventos via `/api/lab/hobelisco/v2/ingest`
- Probes HB Coop: read-only quando disparados manualmente

## O que NÃO faz nesta fase

- ❌ Bloquear login/sync/crédito
- ❌ Alterar saldo, limite ou transações
- ❌ Auto-deploy de políticas
- ❌ Rodar em `HOBELISCO_ENVIRONMENT=PRODUCTION`

## Vercel Preview (staging)

No dashboard Vercel → Environment Variables → **Preview**:

```
HOBELISCO_ENVIRONMENT=STAGING
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
HB_HOBELISCO_STAGING_ENABLED=true
```

Production environment: **não** adicionar estas variáveis.
