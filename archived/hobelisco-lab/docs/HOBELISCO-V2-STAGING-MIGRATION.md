# HOBELISCO V2 — Staging Migration

**STAGING ONLY — NÃO executar em produção**

## 1. Pré-requisitos

- Ambiente staging confirmado (`HOBELISCO_ENVIRONMENT=STAGING`)
- Backup do projeto Supabase staging
- Credenciais read/write **somente** tabelas `hb_hobelisco_*`
- `HB_HOBELISCO_STAGING_ENABLED=true`

## 2. Ambiente

```bash
HOBELISCO_ENVIRONMENT=STAGING
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
HB_HOBELISCO_STAGING_ENABLED=true
HB_HOBELISCO_STAGING_SUPABASE_URL=<staging-url>
HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY=<staging-key>
```

## 3. Backup

Snapshot Supabase staging antes de aplicar.

## 4. Aplicação (MANUAL)

```bash
# Via Supabase SQL editor ou CLI — NUNCA no bootstrap do HOBELISCO
psql $STAGING_DATABASE_URL -f lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql
```

## 5. Validação

```bash
npm run lab:hobelisco-v2-staging-audit
```

Verificar `V2-PERSISTENCE-001` não NOT_VALIDATED.

## 6. Rollback

```sql
DROP TABLE IF EXISTS hb_hobelisco_audit CASCADE;
-- ... demais tabelas hb_hobelisco_*
```

## 7. Confirmação

- Observer inicia sem migration automática
- Nenhuma tabela `hb_credit_*` tocada
- Certificado `HOBELISCO_V2_OBSERVE_ONLY_CERTIFICATE.json` gerado
