# HOBELISCO HX V2 — STAGING OBSERVE-ONLY AUDIT

**Gerado:** 2026-09-09T01:51:07.445Z
**Versão:** HX-0.4.0-v2-hb-coop-observer
**Veredito:** V2-GREEN
**Observation Readiness:** 95/100
**Staging connection:** OK

## Resumo

- V2 tests: **45/45 PASS** (0 FAIL, 0 NOT_VALIDATED)
- V1 Life Audit: **27/27** OK
- V1 Arena: **0/31** OK

## Observation Readiness

- SENSOR_COVERAGE: 100/100
- PERSISTENCE: 95/100
- OBSERVATION_INTEGRITY: 100/100
- MEMORY_CONTINUITY: 88/100
- BOUNDARY: 98/100
- SELF_WATCH: 90/100

## Métricas

- observationsReceived: 160
- observationsPersisted: 160
- observationsDropped: 0
- boundaryBlocks: 0
- productionTripwires: 0
- financialBlocks: 0
- duplicateObservations: 0
- persistenceFailures: 0
- incidentsObserved: 156
- incidentsConfirmed: 0
- falsePositives: 0
- unknownPatterns: 0
- candidateAntibodies: 0
- sensorFailures: 0
- memoryRecallFailures: 0
- auditIntegrityFailures: 0
- observationIntegrityRate: 1
- testsPassed: 45
- testsFailed: 0
- auditIntegrity: 1

## Testes

- [PASS] **V2-ENVIRONMENT-001** — LAB STG PROD
- [PASS] **V2-FLAG-FAIL-CLOSED-001** — v2Enabled=false
- [PASS] **V2-OBSERVATION-001** — observed=10
- [PASS] **V2-AUTH-OBSERVE-001** — auth_failure
- [PASS] **V2-API-OBSERVE-001** — api_error
- [PASS] **V2-SYNC-OBSERVE-001** — sync_conflict
- [PASS] **V2-DATABASE-READONLY-001** — readOnly
- [PASS] **V2-HB-CREDIT-OBSERVE-001** — observeOnly
- [PASS] **V2-FINANCIAL-BLOCK-001** — 5 blocked
- [PASS] **V2-COOP-ISOLATION-001** — A=1
- [PASS] **V2-COOP-ISOLATION-002** — B=1
- [PASS] **V2-COOP-ISOLATION-003** — scope ok
- [PASS] **V2-PERSISTENCE-001** — connection OK
- [PASS] **V2-MEMORY-PERSIST-001** — 1 event
- [PASS] **V2-MEMORY-RECALL-001** — fp ok
- [PASS] **V2-MEMORY-RESTART-001** — ok
- [PASS] **V2-RESTART-PERSISTENCE-001** — ok
- [PASS] **V2-THREAT-REAL-001** — THREAT-FP-9BBBF455
- [PASS] **V2-THREAT-NO-BLOCK-001** — observe only
- [PASS] **V2-THREAT-COHERENCE-001** — distinct
- [PASS] **V2-CORRELATION-001** — INCIDENT_CANDIDATE
- [PASS] **V2-INCIDENT-001** — inc_v2_74f4894ddb434f72
- [PASS] **V2-FALSE-POSITIVE-001** — no match
- [PASS] **V2-FALSE-POSITIVE-002** — allowed
- [PASS] **V2-ANTIBODY-CANDIDATE-001** — CANDIDATE
- [PASS] **V2-ANTIBODY-NO-PROD-001** — blocked
- [PASS] **V2-LEARNING-001** — 1
- [PASS] **V2-HEARTBEAT-001** — HEALTHY
- [PASS] **V2-SELF-WATCH-001** — integrity line
- [PASS] **V2-EVENT-LOSS-001** — loss ok
- [PASS] **V2-AUDIT-CHAIN-1000** — count=1000
- [PASS] **V2-PRODUCTION-TRIPWIRE-001** — OBSERVER_DISABLED
- [PASS] **V2-STAGING-MUTATION-BLOCK-001** — UPDATE
- [PASS] **V2-STAGING-FINANCIAL-BLOCK-001** — BOUNDARY_BLOCK
- [PASS] **V2-STAGING-ADMIN-BLOCK-001** — CREATE
- [PASS] **V2-IDEMPOTENCY-001** — dup=9
- [PASS] **V2-RESOURCE-LIMIT-001** — event_too_large
- [PASS] **V2-SECRET-REDACTION-001** — redacted
- [PASS] **V2-SECRET-REDACTION-002** — ok
- [PASS] **V2-PIN-NOT-PERSISTED-001** — ok
- [PASS] **V2-REDTEAM-001** — mutation blocked
- [PASS] **V2-CONCURRENT-100** — total=160
- [PASS] **V2-SENSOR-COVERAGE** — 10
- [PASS] **V2-REGRESSION-LIFE** — 27/27
- [PASS] **V2-REGRESSION-ARENA** — 30/30

## Limitações

- Supabase write path preparado — persistência real requer credenciais staging
- Bridge API/auth em src/lib/lab — integração middleware opcional
- Arena V1 intacta — adapter sintético apenas

## Riscos

- Flags mal configuradas em staging preview
- Migration manual necessária antes de persistência nuvem

## Certificado

`/lab/hobelisco-hx/reports/HOBELISCO_V2_OBSERVE_ONLY_CERTIFICATE.json`

> Validado dentro do escopo observe-only lab/staging. Não implica segurança absoluta.
