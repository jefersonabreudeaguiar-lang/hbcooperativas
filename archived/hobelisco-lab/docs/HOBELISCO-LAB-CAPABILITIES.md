# HOBELISCO LAB — Capabilities Matrix

Classificação: **IMPLEMENTED** | **PARTIAL** | **SIMULATED** | **NOT_IMPLEMENTED** | **PRODUCTION_FORBIDDEN**

| Capacidade | Status | Evidência |
|------------|--------|-----------|
| HobeliscoRuntime | IMPLEMENTED | `runtime/HobeliscoRuntime.ts` + CLOSURE-RUNTIME-001 |
| HobeliscoEvent contract | IMPLEMENTED | `events/HobeliscoEvent.ts` |
| LabWorld + LabActors | IMPLEMENTED | `lab-world/*` + CLOSURE-LABWORLD-001 |
| Attack Matrix 25 | IMPLEMENTED | `attacks/AttackMatrix.ts` 25/25 |
| Threat DNA | IMPLEMENTED | CLOSURE-THREAT-DNA-001 |
| Memory 3 camadas | IMPLEMENTED | CLOSURE-MEMORY-001 |
| AntibodyEngine lifecycle | IMPLEMENTED | CLOSURE-ANTIBODY-001 |
| EvolutionEngine | IMPLEMENTED | CLOSURE-EVOLUTION-001 |
| Full Core Arena 1000 | IMPLEMENTED | CLOSURE-ARENA-FULL |
| Replay record/compare | IMPLEMENTED | CLOSURE-REPLAY-001 |
| Snapshot + integrity | IMPLEMENTED | CLOSURE-SNAPSHOT-001 |
| Death/Reincarnation | IMPLEMENTED | CLOSURE-LIFECYCLE-001 |
| Hibernation | IMPLEMENTED | CLOSURE-HIBERNATION-001 |
| Organ restart | IMPLEMENTED | CLOSURE-ORGAN-RESTART-001 |
| GuardianValidator | IMPLEMENTED | CLOSURE-GUARDIAN-001 5/5 |
| Circuit Breaker | IMPLEMENTED | CLOSURE-CIRCUIT-001 |
| Financial barrier | IMPLEMENTED | CLOSURE-FINANCIAL-001 8/8 |
| Cooperative isolation | IMPLEMENTED | CLOSURE-ISOLATION-001 |
| Red team | IMPLEMENTED | CLOSURE-REDTEAM-001 |
| Loop guard | IMPLEMENTED | CLOSURE-LOOP-001 |
| OperationalSelfModel | IMPLEMENTED | `organism/OperationalSelfModel.ts` |
| ImmunityReadiness | IMPLEMENTED | `immunity/ImmunityReadiness.ts` |
| Dialogue determinístico | IMPLEMENTED | `dialogue/HobeliscoDialogue.ts` |
| 10000 sims | IMPLEMENTED | `FullCoreArenaRunner.ts` + `npm run lab:hobelisco:arena -- --count=10000` |
| UI timeline completa | IMPLEMENTED | `HobeliscoTimelinePanel.tsx` + `/api/lab/hobelisco/timeline` |
| Staging Supabase | PRODUCTION_FORBIDDEN | V2 observe-only separado |
| Sensores prod middleware | SIMULATED | LabWorld events |
| LLM consciência | NOT_IMPLEMENTED | Por design |
