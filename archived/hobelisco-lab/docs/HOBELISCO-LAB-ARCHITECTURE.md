# HOBELISCO LAB — Arquitetura

## Princípio: EXTENDER > REESCREVER

V1 (`HX-0.2.0-lab-v1`) permanece intacto. A Full Lab Edition adiciona camadas de orquestração.

## Módulos novos

| Módulo | Responsabilidade |
|--------|------------------|
| `lab-world/LabBoundary` | Fail-closed contra produção/staging |
| `lab-world/LabWorld` | Coop-LAB-A/B/C, usuários fictícios, mercado |
| `lab-world/LabEventBus` | Eventos idempotentes → sensores |
| `lab-world/LabClock` | Tempo determinístico para testes |
| `organism/HobeliscoLabOrganism` | Orquestrador principal |
| `organism/HobeliscoBootSequence` | BootReport com checks reais |
| `organism/HobeliscoPulse` | Pulse integrado |
| `organism/ComponentLifecycleManager` | stop/start/restart órgãos seguros |
| `organism/OperationalSelfModel` | SELF_TRUTH derivado do estado |
| `arena/FullCoreSimulationRunner` | 1000 sims pelo Core real |
| `evolution/EvolutionEngine` | Compara defesas (LAB only) |
| `evolution/ReplayEngine` | replay(scenarioId) |
| `evolution/LabSnapshot` | snapshot/restore |
| `full-audit/*` | Suíte completa + ORGANISM score |

## Fluxo de eventos

```
LabWorld → EventBus → Sensors → Core → Memory → Threat → Rules → Risk → Defense → Guardian
```

## Órgãos V1 reutilizados

Core, Heart, Metabolism, Sensors, Memory, Threat DNA, Rules, Risk, Defense, Guardian, CircuitBreaker, Fortress, Audit, Immune, Antibodies, Learning, FinancialGuard, CooperativeIsolation, Arena, LifeAudit, Reincarnation.

## FSM estendida

Adicionados estados `FAILED` e `ANALYSIS` sem remover transições V1 existentes.
