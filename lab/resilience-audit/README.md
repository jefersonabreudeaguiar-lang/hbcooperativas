# Lab — Auditoria de Resiliência

Isolado de `src/`. Simula **todos os fluxos** HB Cooperativas em cenários normais e caóticos.

## Rodar

```bash
npm run lab:resilience-audit
npm run test:sync-flows          # regressão sync (produção)
npm run lab:sync-audit           # auditoria sync detalhada
```

## Rodadas de hardening (automáticas)

| R | Endurecimento |
|---|---------------|
| 0 | Baseline Build 59 |
| 1 | Bloqueio push incoerente + preditor capacidade |
| 2 | + Gate FSM assinatura + alerta duplicatas |
| 3 | + Sync slices + recovery caos |

Relatórios em `lab/resilience-audit/reports/`.

**Nunca** promover lab direto para produção — PRs dedicados por mitigação.
