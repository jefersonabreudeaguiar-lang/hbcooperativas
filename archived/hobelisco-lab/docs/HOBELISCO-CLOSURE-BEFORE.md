# HOBELISCO HX — CLOSURE BEFORE (FASE 0)

**Gerado:** COMANDO 4 — antes de alterações  
**Data:** 2026-09-09

## Versões encontradas

| Versão | Constante |
|--------|-----------|
| V1 | `HX-0.2.0-lab-v1` |
| V2 observe-only | `HX-0.3.0-v2-observe-only` |
| Full organism | `HX-0.4.0-lab-full-organism` |
| Closure (alvo) | `HX-0.3.0-LAB-CLOSURE` |

## Baseline executado (pré-implementação)

| Suíte | Resultado |
|-------|-----------|
| V1 Life Audit | 27/27 LIFE-GREEN |
| V1 Arena | 10/10 + 1000 micro-sims |
| Full Organism Audit | 30/31 (1 falha intermitente DNA identity) |

## Arquivos encontrados (84 .ts em lab/hobelisco-hx/)

### V1 core (preservar)
- `core/`, `heart/`, `state/`, `sensors/`, `memory/`, `threat/`, `rules/`, `risk/`
- `remediation/`, `validation/`, `fortress/`, `audit/`, `immune/`, `antibodies/`
- `learning/`, `financial/`, `security/`, `reincarnation/`, `arena/`, `life-audit/`

### Full organism (COMANDO FINAL)
- `lab-world/` — LabBoundary, LabWorld, LabEventBus, LabClock (5 arquivos)
- `organism/` — HobeliscoLabOrganism, Boot, Pulse, Identity, etc. (7 arquivos)
- `evolution/` — EvolutionEngine, ReplayEngine, LabSnapshot (3 arquivos)
- `full-audit/` — 31 testes organism (4 arquivos)
- `arena/FullCoreSimulationRunner.ts`

### V2 observe-only (preservar)
- `observation/`, `observer/`, `persistence/`, `v2-audit/`

## Módulos encontrados vs esperados (COMANDO 4)

| Capacidade | Status antes | Ação |
|------------|--------------|------|
| HobeliscoRuntime | **AUSENTE** | Criar (wrapper sobre LabOrganism) |
| HobeliscoEvent contract | **PARCIAL** (LabEvent only) | Completar tipos unificados |
| LabActors | **AUSENTE** | Criar |
| AttackMatrix ATTACK-001..025 | **AUSENTE** | Criar |
| GuardianValidator explícito | **PARCIAL** (Guardian.ts) | Extrair/completar |
| AntibodyEngine c/ status | **PARCIAL** (Registry only) | Completar |
| Replay record/compare | **PARCIAL** | Completar |
| Snapshot completo + integrity | **PARCIAL** | Estender |
| ImmunityReadiness classificação | **PARCIAL** (score only) | Completar |
| Unknown behavior detection | **PARCIAL** | Completar em threat |
| Closure audit script | **AUSENTE** | Criar |
| npm lab:hobelisco:closure | **AUSENTE** | Criar aliases |
| Docs closure (7 arquivos) | **AUSENTE** | Criar |
| 10000 sims | **NOT_EXECUTED** | Documentar GAP |

## Capacidades IMPLEMENTADAS (não recriar)

- Manifesto, invariantes, FSM (+ FAILED/ANALYSIS)
- Heartbeat, boot, sensores, metabolism, memory, threat DNA, rules, risk
- Guardian, CircuitBreaker, Fortress, audit chain, immune, learning
- FinancialGuard, cooperativeIsolation, LoopGuard
- Arena V1 + FullCoreSimulationRunner (1000)
- Life Audit 27/27
- LabBoundary, LabWorld, HobeliscoLabOrganism
- Dialogue determinístico

## Scripts npm existentes

```
lab:hobelisco
lab:hobelisco-full-audit
lab:hobelisco-replay
lab:hobelisco-life-audit
lab:hobelisco-arena
lab:hobelisco-v2-staging-audit
```

## Riscos

- Regressão V1 se alterar FSM/FinancialGuard
- Duplicação se recriar Heart/Memory/Guardian
- 30/31 no full audit — corrigir DNA test se regressão

## Arquivos que SERÃO alterados

- `config.ts` — versão closure
- `evolution/ReplayEngine.ts`, `LabSnapshot.ts` — record/compare/integrity
- `lab-world/LabWorld.ts` — integrar LabActors
- `threat/ThreatClassifier.ts` — unknown behavior
- `dialogue/HobeliscoDialogue.ts` — respostas runtime
- `package.json` — aliases closure

## Arquivos que NÃO serão alterados (destrutivamente)

- `core/HobeliscoCore.ts` (sem reescrita)
- `life-audit/phases.ts` (V1 tests intactos)
- `arena/SimulationRunner.ts` (V1 arena intacta)
- `guardian/Guardian.ts` (preservar, estender via GuardianValidator)

## Lacunas prioritárias deste comando

1. HobeliscoRuntime
2. AttackMatrix 25 cenários
3. Closure audit completo
4. Replay record/compare
5. Snapshot integrity
6. AntibodyEngine lifecycle
7. ImmunityReadiness classification
8. Documentação closure (7 docs)
