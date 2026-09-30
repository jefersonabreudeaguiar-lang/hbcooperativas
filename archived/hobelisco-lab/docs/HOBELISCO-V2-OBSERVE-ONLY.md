# HOBELISCO V2 — Observe-Only

**Versão:** HX-0.3.0-v2-observe-only  
**Princípio:** PERCEBER → NORMALIZAR → CORRELACIONAR → LEMBRAR → ANALISAR → CLASSIFICAR → EXPLICAR → PERSISTIR — **SEM ALTERAR**

## 1. Objetivo

Evoluir o organismo lab para observar staging real, persistir memória, correlacionar sinais e produzir evidências auditáveis — sem mutação operacional.

## 2. Arquitetura

```
HB Staging → Observer → SensorBridge → Normalizer → Pipeline
    → CorrelationEngine → Persistence → AuditChain
ObserveOnlyGuard + FinancialGuard (fail-closed)
```

## 3. Ambiente (`HOBELISCO_ENVIRONMENT`)

| Valor | simulation | observation | mutation |
|-------|------------|-------------|----------|
| LAB | true | true | false |
| STAGING | false | true | false |
| PRODUCTION | false | false | false |

## 4. Feature flags (fail-closed)

- `HB_HOBELISCO_V2_ENABLED` — default false
- `HB_HOBELISCO_OBSERVE_ONLY` — default true
- `HB_HOBELISCO_STAGING_ENABLED` — default false
- Produção: V2 observer **DISABLED** independente de flags

## 5. Fluxo

Observation event → sanitize → idempotent persist → correlate → incident candidate (never auto-block)

## 6–15. Componentes

Ver `lab/hobelisco-hx/observation/`, `persistence/`, `observer/`

## 16. Production boundary

`environment === PRODUCTION` → `OBSERVER_DISABLED`

## 17. Limitações

- Supabase staging requer credenciais + migration manual
- Bridge API preparado; middleware não alterado (zero impacto)
- Arena V1 intacta

## 18. Rollback

Desabilitar flags → observer para → dados staging isolados em `hb_hobelisco_*`

## 19. Próximos passos (NÃO neste comando)

ML, blocking, canary prod, auto-rules — roadmap V3+
