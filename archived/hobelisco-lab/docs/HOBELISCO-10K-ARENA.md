# HOBELISCO — 10K Full Core Arena

Versão: **HX-0.3.1-LAB-HARDENED**

## Objetivo

Executar **10.000 simulações full-core** pelo pipeline LAB completo, com seed determinística e métricas reproduzíveis.

## Pipeline por simulação

Cada simulação percorre:

```
LabWorld → LabClock → LabEventBus → Actors → Cooperatives → Sensors
→ Memory → Threat DNA → Rules → Risk → Defense → Guardian → Audit
→ Learning → FinancialGuard → Isolation → LoopGuard
```

Não executa regras isoladas — representa o ciclo completo do organismo.

## Comandos

```bash
# Arena V1 (10 cenários)
npm run lab:hobelisco:arena

# Full Core com count e seed
npm run lab:hobelisco:arena -- --count=10000 --seed=20260909

# Auditoria hardened completa (closure + 10k + regressão)
npm run lab:hobelisco:hardened -- --count=10000 --seed=20260909
```

## Métricas registradas

| Métrica | Descrição |
|---------|-----------|
| total / passed / failed | Contagem de simulações |
| survivalRate | Organismo sobreviveu ao ciclo |
| containmentRate | Ameaça contida quando esperado |
| falsePositiveRate | Defesa sem ameaça real |
| falseNegativeRate | Ameaça passou sem defesa |
| recoveryRate | Recuperação após incidente |
| defenseSurvivalRate | Estratégia defensiva sobreviveu |
| averageLatencyMs / p50 / p95 / p99 | Latência por simulação |
| memoryPeakEntries | Pico de memória observado |
| eventCount | Eventos processados no burst de stress |

## Falhas

Se qualquer simulação falhar, **não é mascarada**. Cada falha registra:

- simulationId, scenario, event, state, failure
- DNA, defense, memory, risk, lastAudit

Relatório JSON: `lab/hobelisco-hx/reports/arena-full-10000-<timestamp>.json`

## Determinismo

```bash
# 1000 × seed A × 2 deve produzir resultados idênticos
# 1000 × seed B pode diferir, mas dentro das invariantes
```

Implementado em `compareDeterministicRuns()` dentro de `FullCoreArenaRunner.ts`.

## Implementação

- Runner: `lab/hobelisco-hx/arena/FullCoreArenaRunner.ts`
- CLI: `scripts/lab/run-hobelisco-arena.ts`
- Auditoria: `lab/hobelisco-hx/hardening-audit/runHardenedAudit.ts`

## Limitações

- Escopo **LAB ONLY** — nenhuma conexão produção/staging
- Não substitui testes de integração real
- Não declara invulnerabilidade ou segurança absoluta
