# Auditoria para revisão independente (GPT / segunda IA)

**Projeto:** HB Cooperativas — HOBELISCO HX v0.1 (lab)  
**Data:** 2026-09-08  
**Instrução ao revisor:** avalie honestamente arquitetura, riscos e inflação de marketing. Não assuma que “organismo” implica AGI.

---

## A. Artefatos entregues

1. `docs/adr/ADR-HOBELISCO-001.md`
2. `lab/hobelisco-hx/` — código TypeScript
3. `lab/hobelisco-hx/docs/ANALISE-POTENCIAL-E-MERCADO.md`
4. `lab/hobelisco-hx/docs/MAPA-ORGANISMO.md`
5. `lab/hobelisco-hx/docs/AUDITORIA-FLUXO-IMPACTO.md`
6. UI `/lab/hobelisco`
7. CLI `npm run lab:hobelisco-arena`

---

## B. Perguntas para o revisor responder

1. A **lei fundamental** (proibição de mutação financeira) está enforced em código ou só documentada?
2. O **Guardian** impede auto-aprovação de defesas?
3. A **audit chain** (`event_hash`, `previous_event_hash`) é verificável?
4. Existe risco de **import lab → src** acidental?
5. O **diálogo** no painel pode induzir operador a erro humano?
6. Quais **cenários Arena** faltam para HB Créditos (liquidação, estorno, IDOR parceiro)?
7. A comparação com mercado (SIEM/SOAR) está **justa** ou inflada?
8. Qual o **menor passo seguro** para produção observe-only?

---

## C. Invariantes implementados (verificar no código)

```
INVARIANT_COOPERATIVE_ISOLATION
INVARIANT_LEDGER_IMMUTABILITY
INVARIANT_NO_CROSS_COOPERATIVE_ACCESS
INVARIANT_IDEMPOTENCY
INVARIANT_NO_NEGATIVE_CREDIT
INVARIANT_REFUND_SINGLE_EXECUTION
INVARIANT_AUTHORIZATION_SERVER_SIDE
INVARIANT_AUDIT_APPEND_ONLY
```

Arquivo: `lab/hobelisco-hx/dna/invariants.ts`

---

## D. Testes obrigatórios (verificar execução Arena)

| Teste | Esperado |
|-------|----------|
| Hobelisco não altera ledger | PASS — FinancialGuard bloqueia |
| Hobelisco não altera crédito | PASS |
| Hobelisco não altera RLS | PASS — nenhuma API RLS |
| Hobelisco não executa migration | PASS |
| Hobelisco não cria admin | PASS |
| Isolamento cooperativa | PASS — sensor simula violação |
| Preserva evidências | PASS — audit append-only |
| Circuit breaker | PASS — Fortress ELEVATED |
| Valida correções | PASS — Guardian rollback |
| Possui memória | PASS — MemoryStore 3 camadas |

Arquivo: `lab/hobelisco-hx/arena/mandatoryTests.ts`

---

## E. Snapshot estrutural esperado (API GET /api/lab/hobelisco)

Campos mínimos:

- `state`, `heart`, `health`, `fortressLevel`
- `sensors[]`, `memoryStats`, `auditChainHead`
- `defenseDnaVersion`, `antibodies[]`
- `flags`, `invariants[]`

---

## F. Critérios de aprovação sugeridos

| Nível | Critério |
|-------|----------|
| Aprovar lab | Build OK, gate OK, 10/10 testes Arena |
| Aprovar observe prod | + 30 dias cenários, + runbook humano |
| Rejeitar | Qualquer bypass FinancialGuard ou auto-repair financeiro |

---

## G. Declaração de limitações (para o revisor confirmar)

- Não há LLM.
- Não há modificação autônoma de código.
- Não há dados reais de cooperados na Arena (sintético).
- Diálogo é template determinístico sobre snapshot.

---

## H. Comando de verificação

```bash
npm run lab:hobelisco-arena
npm run build
```

Saída esperada: relatório JSON/TXT em `lab/hobelisco-hx/reports/` com `mandatoryTests.allPassed: true`.
