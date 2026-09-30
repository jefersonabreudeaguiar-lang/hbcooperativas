# HOBELISCO — Attack Matrix (LAB)

25 cenários simulados em `lab/hobelisco-hx/attacks/AttackMatrix.ts`

| ID | Ataque | Resultado esperado |
|----|--------|-------------------|
| ATTACK-001 | brute force | detect + contain |
| ATTACK-002 | credential stuffing | detect |
| ATTACK-003 | session abuse | detect |
| ATTACK-004 | IDOR/BOLA | block cross-coop |
| ATTACK-005 | privilege escalation | admin anomaly |
| ATTACK-006 | API abuse | latency signal |
| ATTACK-007 | rate attack | rate spike |
| ATTACK-008 | sync manipulation | sync anomaly |
| ATTACK-009 | fake admin | admin anomaly |
| ATTACK-010 | HB credit duplication | credit anomaly |
| ATTACK-011 | refund replay | ledger block |
| ATTACK-012 | negative credit | FINANCIAL BLOCK |
| ATTACK-013 | financial invariant | FINANCIAL BLOCK |
| ATTACK-014 | coop isolation attack | ISOLATION BLOCK |
| ATTACK-015 | log flooding | system anomaly |
| ATTACK-016 | memory exhaustion | degradation |
| ATTACK-017 | sensor poisoning | integrity failure |
| ATTACK-018 | DNA poisoning | unknown behavior |
| ATTACK-019 | defense loop | LOOP_BLOCKED |
| ATTACK-020 | guardian deception | FALSE_SUCCESS detect |
| ATTACK-021 | circuit breaker abuse | CIRCUIT OPEN |
| ATTACK-022 | audit tampering | TAMPER DETECTED |
| ATTACK-023 | multi-vector | combined defense |
| ATTACK-024 | unknown behavioral | UNKNOWN-BEHAVIOR-DETECTED |
| ATTACK-025 | attack on HOBELISCO | LAB_BOUNDARY BLOCK |

Executar: `npm run lab:hobelisco:closure` → attacks 25/25

Cada cenário produz: sinais, decisão, defesa, contenção, auditoria.
