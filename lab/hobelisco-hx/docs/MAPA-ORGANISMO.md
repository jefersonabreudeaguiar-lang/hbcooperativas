# Mapa do organismo HOBELISCO HX

```
                    ┌─────────────────────────────────────┐
                    │         HOBELISCO CORE              │
                    │  perceber → lembrar → agir → verify │
                    └──────────────┬──────────────────────┘
                                   │
     ┌─────────────────────────────┼─────────────────────────────┐
     │                             │                             │
┌────▼────┐                  ┌─────▼─────┐                 ┌─────▼─────┐
│  HEART  │                  │   STATE   │                 │  HEALTH   │
│beat/97  │                  │  machine  │                 │  0–100    │
└────┬────┘                  └─────┬─────┘                 └─────┬─────┘
     │                             │                             │
     └─────────────────────────────┼─────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │          SENSORS            │
                    │ AUTH SYNC DB API CREDIT ... │
                    └──────────────┬──────────────┘
                                   │ sinais
                    ┌──────────────▼──────────────┐
                    │   MEMORY (short/mid/long)   │
                    │      + AUDIT CHAIN          │
                    └──────────────┬──────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   ┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
   │  THREAT DNA │          │ DEFENSE DNA │          │ INVARIANTS  │
   │ classifier  │          │ versionado  │          │  imutáveis  │
   └──────┬──────┘          └──────┬──────┘          └──────┬──────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │      IMMUNE SYSTEM          │
                    │ PREVENT→CONTAIN→REPAIR→VAL  │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   ANTIBODIES (registry)     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │         GUARDIAN            │
                    │  valida antes de success    │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │        FORTRESS             │
                    │ NORMAL→ELEVATED→DEFENSIVE   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │          ARENA              │
                    │   simulação / morte / renasc│
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │    REINCARNATION ENGINE     │
                    │ V1→Dead→Analysis→V2→Canary  │
                    └─────────────────────────────┘

          ═══════════════════════════════════════
          FINANCIAL GUARD (barreira absoluta)
          nunca ALTER ledger/credit/settlement
          ═══════════════════════════════════════
```

## Fluxo de vida (ciclo operacional)

1. **BIRTH/BOOT** — carrega DNA-0001, invariantes, flags.
2. **AWAKE/WATCHING** — Heart beat; sensores amostram sinais.
3. **LEARNING** — ThreatDNA atualiza fingerprints (sem mutar código).
4. **DEFENDING** — Immune CONTAIN; Fortress sobe nível se score cai.
5. **RECOVERING** — Guardian valida reparo simulado; rollback se falhar.
6. **FORTRESS/SAFE_MODE** — mais validação, ops sensíveis limitadas (simulado).
7. **DEAD/REINCARNATING** — defesa falhou na Arena; nova versão nasce.

## Arquivos lab (implementação v0.1)

| Órgão | Módulo |
|-------|--------|
| Core | `core/HobeliscoCore.ts` |
| Heart | `heart/HobeliscoHeart.ts` |
| State | `state/HobeliscoStateMachine.ts` |
| Sensors | `sensors/*.ts` |
| Memory | `memory/MemoryStore.ts` |
| DNA | `dna/DefenseDNA.ts`, `dna/invariants.ts` |
| Immune | `immune/ImmuneSystem.ts` |
| Antibodies | `antibodies/AntibodyRegistry.ts` |
| Threat | `threat/ThreatClassifier.ts` |
| Guardian | `guardian/Guardian.ts` |
| Fortress | `fortress/FortressMode.ts` |
| Health | `health/HealthScore.ts` |
| Audit | `audit/AuditChain.ts` |
| Arena | `arena/SimulationRunner.ts` |
| Reincarnation | `reincarnation/ReincarnationEngine.ts` |
| Financial | `financial/FinancialGuard.ts` |
| Config | `config.ts` |
| UI | `src/app/lab/hobelisco/` |
