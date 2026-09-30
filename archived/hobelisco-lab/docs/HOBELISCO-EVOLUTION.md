# HOBELISCO — Evolution (LAB)

## Lineage DNA

```
DNA-0001
  ├── DNA-0002 (mutation: tighten cross-coop)
  └── DNA-0003
```

Registro: `reincarnation/DefenseRegistry.ts`, `dna/DefenseDNA.ts`

## Fluxo evolutivo

```
DEFENSE FAILED → DEAD → ANALYSIS → HYPOTHESIS → NEW DNA → ARENA → VALIDATION
```

## EvolutionEngine

`evolution/EvolutionEngine.ts` — compara DEFENSE-A vs DEFENSE-B

Decisões: REJECTED | PROPOSED | VALIDATED

Nova defesa superior apenas se melhora em múltiplas dimensões (survival, containment, recovery, FP, FN).

## AntibodyEngine

`antibodies/AntibodyEngine.ts`

Status: CANDIDATE → TESTING → VALIDATED | FAILED | ACTIVE | RETIRED

Origem obrigatória: incident + rule + threat DNA

## Evidência

CLOSURE-EVOLUTION-001: VALIDATED  
CLOSURE-ANTIBODY-001: origin required

Nunca promove para produção.
