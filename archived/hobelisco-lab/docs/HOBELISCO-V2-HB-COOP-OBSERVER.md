# HOBELISCO V2 — Observador Read-Only HB Coop

Versão: **HX-0.4.0-v2-hb-coop-observer**

## Arquitetura

```
HB COOP (staging)
       │
       ▼ READ-ONLY
  HOBELISCO SENSOR (bridge + probes)
       │
   ┌───┴───┐
   ▼       ▼
MEMÓRIA  THREAT DNA (correlação)
   │       │
   └───┬───┘
       ▼
     RISCO (incident candidate)
       │
       ▼
    DEFESA → HUMAN REQUIRED
       │
       ▼
  NUNCA AUTOMÁTICO
```

## Princípios

| Regra | Implementação |
|-------|---------------|
| Read-only | `ObserveOnlyGuard` + probes SELECT only |
| Sem mutação | `blockAnyMutation()` em 18 categorias |
| Sem auto-defesa | Incidentes = CANDIDATE, confirm exige `humanAck` |
| Produção bloqueada | `environment === PRODUCTION → OBSERVER_DISABLED` |
| Fail-closed | Flags default `false` |

## Ativação (LAB local)

```env
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
HOBELISCO_ENVIRONMENT=LAB
HB_HOBELISCO_LAB_ENABLED=true
```

## Ativação (Staging)

```env
HB_HOBELISCO_V2_ENABLED=true
HB_HOBELISCO_OBSERVE_ONLY=true
HB_HOBELISCO_STAGING_ENABLED=true
HOBELISCO_ENVIRONMENT=STAGING
HB_HOBELISCO_STAGING_SUPABASE_URL=https://...
HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY=...
HB_HOBELISCO_PROBE_COOP_CNPJ=00000000000000
```

Schema: `lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql`

## Comandos

```bash
# Verificar schema Supabase
npm run lab:verify-hobelisco-v2-schema

# Auditoria V2 completa
npm run lab:hobelisco:v2

# UI + API
# GET  /api/lab/hobelisco/v2       — status
# POST /api/lab/hobelisco/v2       — ciclo observe
# /lab/hobelisco                   — painel V2
```

## Componentes novos

| Arquivo | Função |
|---------|--------|
| `observer/ObserverSingleton.ts` | Singleton + init + fire-and-forget |
| `observation/HbCoopReadOnlyProbes.ts` | Probes HB Credit + Sync (SELECT) |
| `src/lib/lab/hbCoopReadOnlyProbes.ts` | Probes read-only HB Coop (fora boundary lab) |
| `persistence/SupabaseStagingPersistence.ts` | Writes reais Supabase staging |
| `src/lib/lab/hobeliscoObservationBridge.ts` | Bridge API/auth/sync → observer |
| `src/instrumentation.ts` | Bootstrap server-side |
| `src/app/api/lab/hobelisco/v2/route.ts` | Status + ciclo observe |
| `src/app/lab/hobelisco/HobeliscoV2Panel.tsx` | UI observador |

## Bridge (captura tráfego real)

Chame nos handlers de API quando V2 ativo:

```typescript
import { recordApiObservation } from "@/lib/lab/hobeliscoObservationBridge";

recordApiObservation({
  endpoint: "/api/example",
  method: "POST",
  status: 200,
  latencyMs: 45,
  cooperativeId: cnpj,
});
```

Bootstrap automático via `instrumentation.ts` quando flags ativas.

## Limitações

- Probes HB Coop requerem credenciais staging explícitas
- Incidentes nunca confirmados sem humano
- Não substitui monitoramento de produção
- Não declara invulnerabilidade

## Próximo passo (V3+)

- Wire bridge em middleware/route wrappers
- Dashboard incidentes staging
- Alertas human-in-loop
