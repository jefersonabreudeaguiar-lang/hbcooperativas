# HOBELISCO HX — Organismo Digital Vivo (LAB Full Edition)

Versão: `HX-0.4.0-lab-full-organism`  
Organism ID: `HOBELISCO-HX-LAB-0001`

## O que é

O HOBELISCO HX no LAB é um **organismo digital operacional** — não consciência humana, mas um ciclo vital funcional:

PERCEIVE → REMEMBER → REASON → ACT → VERIFY → RECOVER → LEARN

Tudo ocorre **somente no LAB**, sem conexão operacional com produção, staging, Supabase real, HB Credit real ou ledger real.

## Arquitetura (extensão V1)

```
HOBELISCO HX LAB
       │
   CORE V1 (preservado)
       │
  ┌────┴────┐
  │ organism/ │  HobeliscoLabOrganism, Boot, Pulse, Identity
  │ lab-world/│  LabWorld, EventBus, Clock, Boundary
  │ evolution/│  EvolutionEngine, ReplayEngine, LabSnapshot
  │ full-audit│  Suíte HOBELISCO-LAB-*
  └───────────┘
```

## Ciclo vital

Estados: BIRTH → BOOT → AWAKE → WATCHING → DEFENDING → FORTRESS → (FAILED → DEAD → ANALYSIS → REINCARNATING) → BOOT → AWAKE

Hibernação: WATCHING → HIBERNATING → (evento crítico) → AWAKE

## Comandos

```bash
npm run lab:hobelisco                    # boot + pulse loop
npm run lab:hobelisco -- --demo          # demonstração vida completa
npm run lab:hobelisco -- --scenario auth-burst
npm run lab:hobelisco-full-audit         # auditoria completa
npm run lab:hobelisco-replay -- REPLAY-001 42
npm run lab:hobelisco-life-audit         # regressão V1
npm run lab:hobelisco-arena              # regressão Arena
```

## Boundaries

Qualquer tentativa de PRODUCTION / REAL_DATABASE / REAL_HB_CREDIT → `BLOCKED_BY_LAB_BOUNDARY`

FinancialGuard bloqueia CREATE_CREDIT, CONSUME_CREDIT, REFUND, SETTLEMENT, LEDGER_UPDATE, etc.

## Limitações

- Validado no escopo do LAB
- Sensores alimentados por eventos simulados (LabWorld)
- 10.000 simulações full-core: NOT_EXECUTED (1000 executadas)
- Não declarar “perfeito” ou “100% seguro”

## Status

Executar `npm run lab:hobelisco-full-audit` para veredito ORGANISM-GREEN / AMBER / RED.
