# HOBELISCO HX — Code Reality Map (FASE 1)

**Versão auditada:** HX-0.2.0-lab-v1  
**Gerado:** COMANDO 2 — Auditoria de Vida  
**Escopo:** `lab/hobelisco-hx/` + bridge lab (`src/app/lab/hobelisco`, `src/lib/lab/`)

> Comparação honesta entre documentação (`docs/HOBELISCO-HX.md`, ADR-001, MAPA-ORGANISMO) e código real inspecionado.

---

## Legenda de classificação

| Status | Significado |
|--------|-------------|
| **IMPLEMENTADO** | Módulo existe, funcional no lab, testado |
| **PARCIAL** | Existe mas incompleto vs spec |
| **SIMULADO** | Lógica real, dados/contexto sintéticos |
| **MOCK** | Retorno fixo sem lógica de negócio |
| **AUSENTE** | Documentado mas não existe no código |
| **INCONSISTENTE** | Doc e código divergem materialmente |

---

## Componentes vitais

| Componente | Path | Doc | Realidade | Notas |
|------------|------|-----|-----------|-------|
| **Core** | `core/HobeliscoCore.ts` | PERCEIVE→VERIFY | **IMPLEMENTADO** | Orquestra órgãos; boot determinístico |
| **Heart** | `heart/HobeliscoHeart.ts` | Heartbeat + self-watch | **IMPLEMENTADO** | `emitHeartbeat`, degradação detectável |
| **State** | `state/HobeliscoStateMachine.ts` | 12 estados | **IMPLEMENTADO** | FSM com transições válidas/inválidas |
| **Health** | `health/HealthScore.ts` | Score 0–100 | **SIMULADO** | Cálculo real, inputs sintéticos fixos |
| **Metabolism** | `metabolism/DefenseBudget.ts` | Budget por risco | **IMPLEMENTADO** | Ajusta sensores ativos por L0–L3 |
| **Sensors** | `sensors/index.ts` | 10 sensores | **SIMULADO** | 10 sensores reais; não lê middleware prod |
| **Memory** | `memory/MemoryStore.ts` | Short/Mid/Long | **IMPLEMENTADO** | 3 camadas + enrich; sem mutação de código |
| **Threat** | `threat/ThreatClassifier.ts` | THREAT-FP-* | **IMPLEMENTADO** | Fingerprints SHA coerentes |
| **Rules** | `rules/RuleEngine.ts` | 15 regras | **IMPLEMENTADO** | AUTH→SYSTEM; match determinístico |
| **Risk** | `risk/RiskEngine.ts` | L0–L3 | **IMPLEMENTADO** | Sem reparo financeiro auto |
| **Remediation** | `remediation/AutoRepair.ts` | Reparos reversíveis | **IMPLEMENTADO** | Whitelist + forbidden list |
| **Validation** | `validation/CircuitBreaker.ts` | 3 falhas → open | **IMPLEMENTADO** | Testado FASE 14 |
| **LoopGuard** | `validation/LoopGuard.ts` | Anti-loop | **IMPLEMENTADO** | Adicionado COMANDO 2 |
| **Guardian** | `guardian/Guardian.ts` | FALSE_SUCCESS | **IMPLEMENTADO** | 9 invariantes; rollback simulado |
| **Fortress** | `fortress/FortressMode.ts` | NORMAL→FORTRESS | **IMPLEMENTADO** | Escalada por health/threat |
| **Audit** | `audit/AuditChain.ts` | Hash chain | **IMPLEMENTADO** | 100 eventos + tamper detect |
| **Immune** | `immune/ImmuneSystem.ts` | PREVENT→VALIDATE | **IMPLEMENTADO** | Pipeline imune lab |
| **Antibodies** | `antibodies/AntibodyRegistry.ts` | Registry | **IMPLEMENTADO** | Match por threat pattern |
| **Learning** | `learning/LearningEngine.ts` | Insights PROPOSED | **IMPLEMENTADO** | Determinístico; não promove regras |
| **Storage** | `storage/LabPersistence.ts` | hb_hobelisco_* | **SIMULADO** | In-memory; SQL schema referência only |
| **Financial** | `financial/FinancialGuard.ts` | Barreira absoluta | **IMPLEMENTADO** | Expandido FASE 15 (12 ações) |
| **DNA** | `dna/DefenseDNA.ts`, `invariants.ts` | Versionado + 9 leis | **IMPLEMENTADO** | Lineage explicável |
| **Reincarnation** | `reincarnation/ReincarnationEngine.ts` | Morte→renascimento | **PARCIAL** | Engine + DefenseRegistry COMANDO 2 |
| **DefenseRegistry** | `reincarnation/DefenseRegistry.ts` | Métricas Arena | **IMPLEMENTADO** | DEFENSE-TEST-001/002, survival |
| **Arena** | `arena/SimulationRunner.ts` | 10 cenários + 1000 sims | **IMPLEMENTADO** | Micro-sims leves determinísticas |
| **Coop isolation** | `security/cooperativeIsolation.ts` | Isolamento A/B | **IMPLEMENTADO** | Adicionado COMANDO 2 |
| **Dialogue** | `dialogue/HobeliscoDialogue.ts` | Q&A lab | **IMPLEMENTADO** | Respostas citadas do snapshot |
| **Vitality** | `life-audit/vitalityScore.ts` | HOBELISCO_VITALITY_SCORE | **IMPLEMENTADO** | 7 dimensões, 0–100 |
| **Life Audit** | `life-audit/*` | 27 fases | **IMPLEMENTADO** | 27 testes executáveis |
| **Boundary check** | `life-audit/boundaryCheck.ts` | Lab ≠ prod | **IMPLEMENTADO** | Scan estático de imports |

---

## Bridge lab (fora de `lab/hobelisco-hx/`)

| Componente | Path | Realidade | Notas |
|------------|------|-----------|-------|
| **Feature flag** | `src/lib/lab/hobeliscoLabGate.ts` | **IMPLEMENTADO** | `HB_HOBELISCO_LAB_ENABLED`; fail-closed prod |
| **UI Lab** | `src/app/lab/hobelisco/` | **IMPLEMENTADO** | Visualização + diálogo; não toca prod |
| **API Lab** | `src/app/api/lab/hobelisco/` | **IMPLEMENTADO** | Whitelist em `publicApiPaths.ts` |
| **Script Arena** | `scripts/lab/run-hobelisco-arena.ts` | **IMPLEMENTADO** | npm `lab:hobelisco-arena` |
| **Script Life Audit** | `scripts/lab/run-hobelisco-life-audit.ts` | **IMPLEMENTADO** | npm `lab:hobelisco-life-audit` |

---

## Divergências doc vs código

| Item | Documentação | Código | Classificação |
|------|--------------|--------|---------------|
| Persistência nuvem | `hb_hobelisco_*` tables | In-memory only | **SIMULADO** |
| Sensores prod | Observação middleware | Context object sintético | **SIMULADO** |
| Hibernação auto | Reduz atividade em ambiente estável | Só via FSM manual | **PARCIAL** |
| COMPONENT_DEAD restart | Órgão morre e renasce | Detecta via self-watch; sem restart | **PARCIAL** |
| Promoção pós-Arena | Canary manual | Não promove automaticamente | **IMPLEMENTADO** (correto V1) |
| ML / auto-código | Proibido V1 | Ausente | **IMPLEMENTADO** (correto) |
| 1000 micro-sims full-core | Spec original | Micro-sims leves no runner | **INCONSISTENTE** (doc aspiracional) |
| Estados DEAD/REINCARNATING | Ciclo completo prod | Arena + registry; não full prod path | **PARCIAL** |

---

## Feature flags (`config.ts`)

| Flag | Status |
|------|--------|
| `HB_HOBELISCO_LAB_ENABLED` | **IMPLEMENTADO** — gate externo |
| Flags internas lab | **IMPLEMENTADO** — `loadHobeliscoFlags()` |

---

## Boundary produção

Scan estático em `life-audit/boundaryCheck.ts`:

- Sem imports `@/app/(app)`, `contaCoopStorage`, `hb_credit_*`, migrations
- **Resultado COMANDO 2:** OK (0 violações após exclusão do próprio checker)

---

## Arquivos analisados (lab core)

40 arquivos `.ts` em `lab/hobelisco-hx/` + docs + reports + bridge lab.

Lista completa gerada automaticamente em cada execução de `lab:hobelisco-life-audit` → campo `filesAnalyzed` do JSON.

---

## Conclusão FASE 1

O organismo **existe e é funcional no lab**. A arquitetura documentada corresponde **majoritariamente** ao código. Gaps principais:

1. Sensores não conectados a observação real (V2)
2. Persistência in-memory vs SQL referência (V2)
3. Hibernação e restart de órgãos parciais
4. Micro-sims leves vs full-core na spec

Nenhum gap justifica mover para produção. Recomendação: manter **LAB ONLY** até V2.

---

## Atualização — COMANDO FINAL (HX-0.4.0-lab-full-organism)

**Gerado:** COMANDO FINAL — Full Lab Edition  
**Veredito:** ORGANISM-GREEN (31/31 testes organism + V1 regression OK)

### Novos módulos (aditivos — V1 preservado)

| Módulo | Path | Status |
|--------|------|--------|
| LabBoundary | `lab-world/LabBoundary.ts` | **IMPLEMENTADO** |
| LabWorld / EventBus / Clock | `lab-world/*` | **IMPLEMENTADO** |
| HobeliscoLabOrganism | `organism/HobeliscoLabOrganism.ts` | **IMPLEMENTADO** |
| BootSequence / Pulse | `organism/HobeliscoBoot*.ts` | **IMPLEMENTADO** |
| ComponentLifecycleManager | `organism/ComponentLifecycleManager.ts` | **IMPLEMENTADO** |
| OperationalSelfModel | `organism/OperationalSelfModel.ts` | **IMPLEMENTADO** |
| FullCoreSimulationRunner | `arena/FullCoreSimulationRunner.ts` | **IMPLEMENTADO** (1000 sims) |
| EvolutionEngine | `evolution/EvolutionEngine.ts` | **IMPLEMENTADO** |
| ReplayEngine / LabSnapshot | `evolution/*` | **IMPLEMENTADO** |
| Full Organism Audit | `full-audit/*` | **IMPLEMENTADO** |

### FSM estendida

Estados adicionados: `FAILED`, `ANALYSIS` — transições V1 preservadas.

### Scripts npm

- `lab:hobelisco` — boot + pulse loop
- `lab:hobelisco-full-audit` — auditoria completa
- `lab:hobelisco-replay` — replay LAB

### Gaps remanescentes

- 10.000 simulações full-core: NOT_EXECUTED
- UI timeline completa: parcial
- Time-travel: snapshot+replay básico
