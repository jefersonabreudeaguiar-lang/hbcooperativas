# HOBELISCO V2 — Staging Runbook

## ENABLE

1. Configurar env staging (ver migration doc)
2. Aplicar SQL manualmente
3. `HB_HOBELISCO_V2_ENABLED=true`

## VERIFY

```bash
npm run lab:hobelisco-v2-staging-audit
npm run lab:hobelisco-life-audit
npm run lab:hobelisco-arena
```

## OBSERVE

- Observer processa sinais via `SensorBridge`
- API bridge: `src/lib/lab/hobeliscoObservationBridge.ts` (opcional)

## MONITOR

- Heartbeat V2: `HEALTHY | DEGRADED | SAFE_MODE`
- Métricas: `observationIntegrityRate`, `observationsDropped`

## DISABLE

```bash
HB_HOBELISCO_V2_ENABLED=false
```

## ROLLBACK

1. Disable flags
2. Drop tabelas staging se necessário
3. V1 lab continua operacional independentemente
