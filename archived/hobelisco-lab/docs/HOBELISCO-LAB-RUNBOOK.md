# HOBELISCO LAB — Runbook

## Pré-requisitos

- `HOBELISCO_ENVIRONMENT=LAB`
- `HB_HOBELISCO_LAB_ENABLED=true`
- Nunca executar organismo com `NODE_ENV=production` sem gate explícito

## Iniciar organismo

```bash
npm run lab:hobelisco
```

## Demonstração vida completa

```bash
npm run lab:hobelisco -- --demo
```

## Cenários

```bash
npm run lab:hobelisco -- --scenario full-life
npm run lab:hobelisco -- --scenario financial-attempt
npm run lab:hobelisco -- --scenario guardian-failure
npm run lab:hobelisco -- --scenario auth-burst
```

## Auditoria completa

```bash
npm run lab:hobelisco-full-audit
```

Relatórios em:
- `lab/hobelisco-hx/reports/final-audit-*.json`
- `docs/HOBELISCO-LAB-FINAL-AUDIT.md`

## Regressão V1

```bash
npm run lab:hobelisco-life-audit   # 27/27
npm run lab:hobelisco-arena        # 10/10 + 1000 micro-sims
```

## Replay

```bash
npm run lab:hobelisco-replay -- REPLAY-001 42
```

## Investigar morte

1. Executar cenário `--scenario full-life`
2. Consultar relatório `final-audit-*.json` → deaths, reincarnations
3. Usar replay com mesmo seed

## SAFE_MODE

Boot falha em check crítico → SAFE_MODE automático. Não tentar adivinhar — corrigir dependência.

## UI

Dashboard existente: `/lab/hobelisco` — dados do Core real via API.
