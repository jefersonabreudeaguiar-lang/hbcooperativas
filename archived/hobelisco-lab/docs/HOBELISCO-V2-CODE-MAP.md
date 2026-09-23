# HOBELISCO V2 — Code Map (V1 → V2)

**V1:** HX-0.2.0-lab-v1 | **V2:** HX-0.3.0-v2-observe-only

| Componente | V1 atual | Reutilizado | Alterado | Novo |
|------------|----------|-------------|----------|------|
| Core | `core/HobeliscoCore.ts` | ✅ | — | — |
| DNA / Invariants | `dna/*` | ✅ | — | — |
| Arena | `arena/*` | ✅ | — | Adapter opcional |
| Heartbeat | `heart/HobeliscoHeart.ts` | ✅ | — | `observer/HeartbeatV2.ts` |
| Sensores | `sensors/index.ts` | ✅ | — | `observation/SensorBridge.ts` |
| Memória | `memory/MemoryStore.ts` | ✅ | — | Persistência V2 |
| Threat DNA | `threat/ThreatClassifier.ts` | ✅ | — | — |
| Rules | `rules/RuleEngine.ts` | ✅ | — | — |
| Risk | `risk/RiskEngine.ts` | ✅ | — | — |
| Remediation | `remediation/AutoRepair.ts` | ✅ | — | — |
| Guardian | `guardian/Guardian.ts` | ✅ | — | — |
| Circuit Breaker | `validation/CircuitBreaker.ts` | ✅ | — | — |
| Fortress | `fortress/FortressMode.ts` | ✅ | — | — |
| AuditChain | `audit/AuditChain.ts` | ✅ | — | — |
| Antibodies | `antibodies/AntibodyRegistry.ts` | ✅ | — | CANDIDATE state doc |
| Learning | `learning/LearningEngine.ts` | ✅ | — | — |
| FinancialGuard | `financial/FinancialGuard.ts` | ✅ | — | — |
| Coop Isolation | `security/cooperativeIsolation.ts` | ✅ | — | — |
| LabPersistence | `storage/LabPersistence.ts` | ✅ | — | — |
| Life Audit | `life-audit/*` | ✅ | — | — |
| Environment | — | — | — | **NOVO** `environment/` |
| Observation pipeline | — | — | — | **NOVO** `observation/` |
| Persistence V2 | — | — | — | **NOVO** `persistence/` |
| Observer | — | — | — | **NOVO** `observer/` |
| V2 Audit | — | — | — | **NOVO** `v2-audit/` |
| Config flags | `config.ts` | parcial | V2 flags | — |
| Gate server | `hobeliscoLabGate.ts` | ✅ | — | `hobeliscoV2Gate.ts` |

## Classificação

| Módulo | Status |
|--------|--------|
| Core, DNA, Arena, Guardian, Financial | IMPLEMENTADO (V1 intacto) |
| Sensores V1 | SIMULADO → bridge V2 |
| LabPersistence | SIMULADO → InMemoryPersistence V2 |
| Supabase staging | NOVO V2 — NOT_CONFIGURED até credenciais |
| Observation pipeline | NOVO V2 IMPLEMENTADO |
| Correlation / Incidents | NOVO V2 IMPLEMENTADO |
