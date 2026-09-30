# HOBELISCO — Life Cycle (LAB)

## Fluxo normal

```
BIRTH → BOOT → AWAKE → WATCHING → DEFENDING → FORTRESS
                              ↓
                         RECOVERING → LEARNING → AWAKE
```

## Morte defensiva

```
DEFENDING → FAILED → DEAD → ANALYSIS → REINCARNATING → BOOT → AWAKE
```

## Hibernação

```
WATCHING → HIBERNATING → (evento crítico) → AWAKE → WATCHING
```

## Implementação

- FSM: `state/HobeliscoStateMachine.ts` (+ FAILED, ANALYSIS)
- Runtime: `runtime/HobeliscoRuntime.ts` — `runDeathCycle()`, `transition()`
- Organism: `organism/HobeliscoLabOrganism.ts` — cenários LIFE-*

## Evidência

CLOSURE-LIFECYCLE-001: death cycle comprovado  
CLOSURE-HIBERNATION-001: hibernação comprovada  
CLOSURE-DEATH-REINCARNATION: REINCARNATING alcançado

## UI Life Timeline (LAB-HARDENED)

Painel `/lab/hobelisco` → aba **Life Timeline** exibe transições reais do `TimelineCollector`.

Ver `docs/HOBELISCO-TIMELINE.md`.
