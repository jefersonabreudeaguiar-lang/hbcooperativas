# ADR-HOBELISCO-001 — Nascimento do organismo HOBELISCO HX (Laboratório)

**Status:** Aceito para implementação em lab  
**Data:** 2026-09-08  
**Autor:** Arquitetura HB Cooperativas  
**Escopo:** `lab/hobelisco-hx/` + UI `/lab/hobelisco` — **não produção**

---

## Contexto

HB Cooperativas já possui:

- autenticação JWT + RBAC (`middleware`, `apiGuard`);
- isolamento por cooperativa;
- auditoria operacional (`cooperative_audit_log`, `hb_credit_audit_log`);
- gates fail-closed (`CreditFeatureGate`, `syncLabGate`, `fichaSyncGuard`);
- laboratórios isolados (`lab/sync-update`, `lab/resilience-audit`).

Não existe hoje um **organismo unificado** que perceba, memorize, classifique ameaças e evolua defesas com validação independente. A proposta HOBELISCO HX preenche essa lacuna **como camada observacional e defensiva**, nunca como autoridade financeira.

---

## Decisão

1. Criar HOBELISCO HX como **infraestrutura de órgãos vitais** em `lab/hobelisco-hx/`.
2. **Não** integrar em produção nesta fase.
3. **Não** usar LLM, auto-modificação de código ou migrations autônomas.
4. Expor painel lab em `/lab/hobelisco` com gate `HB_HOBELISCO_LAB_ENABLED` (fail-closed em produção).
5. Toda promoção futura seguirá pipeline: Arena → Validated → Canary → Production (Reincarnation Engine).

---

## Lei fundamental (inviolável)

O HOBELISCO **observa** e **contém**. Nunca **altera**:

| Proibido | Enforcement |
|----------|-------------|
| Ledger / crédito / saldo | `FinancialGuard` + invariantes |
| RLS / roles / admins | DNA + testes obrigatórios |
| Migrations / código prod | sem import de `lab/` em `src/` produtivo |
| Auto-reparo financeiro | `HUMAN_REQUIRED` + `FREEZE` |

---

## Mapa de conexão com HB Cooperativas

| Órgão HX | Conexão futura (produção) | Fase atual |
|----------|---------------------------|------------|
| AUTH SENSOR | `middleware`, `apiGuard`, `logSecurityEvent` | Simulado na Arena |
| SYNC SENSOR | `CooperativaSyncProvider`, `fichaSyncGuard` | Simulado |
| DATABASE SENSOR | Supabase health, schema status | Simulado |
| API SENSOR | rate limit, public paths | Simulado |
| HB CREDIT SENSOR | `creditGuard`, `contaCoopStorage` | Simulado |
| INTEGRITY SENSOR | `coherenceValidator`, assinatura FSM | Simulado |
| BEHAVIOR SENSOR | sequência de eventos / ThreatDNA | Lab only |
| MEMORY | audit chain append-only | Lab store |
| GUARDIAN | validação pós-reparo | Lab only |
| FORTRESS | elevar validações, limitar ops sensíveis | Flag lab |

---

## Estados do organismo

```
BIRTH → BOOT → AWAKE → WATCHING
                    ↓
         LEARNING / DEFENDING / RECOVERING
                    ↓
         FORTRESS / SAFE_MODE / HIBERNATING
                    ↓
              DEAD → REINCARNATING
```

Comportamento depende do estado. Transições registradas na audit chain.

---

## Feature flags (fail-closed)

| Flag | Default prod | Default dev |
|------|--------------|-------------|
| `HOBELISCO_ENABLED` | false | false |
| `HOBELISCO_MODE` | `observe` | `arena` |
| `HOBELISCO_AUTO_REPAIR` | false | false |
| `HOBELISCO_FORTRESS` | false | false |
| `HOBELISCO_ARENA` | false | true (lab) |
| `HB_HOBELISCO_LAB_ENABLED` | false | true |

---

## Consequências

### Positivas

- Base evolutiva por anos sem reescrita total.
- Defesas testáveis na Arena antes de qualquer promoção.
- Memória imunológica (anticorpos) reutilizável.
- Painel único para saúde e incidentes.

### Negativas / riscos

- Complexidade cognitiva para a equipe.
- Risco de **teatralização** (metáfora “organismo”) mascarar software comum — mitigado por ADR e auditorias honestas.
- Integração prod exige PRs dedicados; não merge direto do lab.

---

## Alternativas consideradas

1. **Só WAF + Supabase RLS** — insuficiente para comportamento e memória imunológica.
2. **SIEM comercial (Datadog/Sentry)** — complementar, não substitui regras de domínio HB.
3. **LLM autônomo** — rejeitado: imprevisível, viola lei fundamental.

---

## Critérios de promoção (futuro)

- [ ] 0 falhas nos testes obrigatórios da Arena
- [ ] Auditoria GPT + humana aprovada
- [ ] Canary 7 dias sem incidente crítico
- [ ] Nenhuma mutação financeira observada

---

## Referências internas

- `lab/hobelisco-hx/docs/ANALISE-POTENCIAL-E-MERCADO.md`
- `lab/hobelisco-hx/docs/MAPA-ORGANISMO.md`
- `lab/hobelisco-hx/docs/AUDITORIA-FLUXO-IMPACTO.md`
- `lab/hobelisco-hx/docs/AUDITORIA-PARA-GPT.md`
