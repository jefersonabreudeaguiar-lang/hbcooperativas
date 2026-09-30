# HOBELISCO HX — Documentação V1 (Lab)

**Versão:** HX-0.2.0-lab-v1  
**Escopo:** `lab/hobelisco-hx/` + `/lab/hobelisco` — **não produção**

---

## Filosofia

HOBELISCO HX é uma **camada viva transversal** do HB Cooperativas: observa, memoriza, classifica, contém e evolui **sem** autoridade financeira.

Não é antivírus genérico. Não é LLM. Não é monitoramento passivo.

Princípios (`dna/manifesto.ts`):

1. Observo antes de agir  
2. Lembro antes de decidir  
3. Verifico antes de confiar  
4. Aprendo antes de repetir  
5. Morro apenas na Arena  
6. Renasço mais forte  
7. Nunca sacrifico a integridade do HB  

---

## Arquitetura — três entidades

| Entidade | Função |
|----------|--------|
| **CORE** | PERCEIVE · REMEMBER · REASON · ACT · VERIFY |
| **DNA** | Regras, limiares, anticorpos, políticas versionadas |
| **ARENA** | Morte/falha/renascimento — nunca em produção |

---

## Estados vitais

```
BIRTH → BOOT → AWAKE → WATCHING → DEFENDING → FORTRESS
                              ↓         ↓
                         LEARNING ← RECOVERING
                              ↓
                            AWAKE
```

Falha de defesa: `DEFENSE → FAILED → DEAD → ANALYSIS → REINCARNATING → NEW DEFENSE`

---

## Órgãos V1

| Módulo | Responsabilidade |
|--------|------------------|
| `heart/` | HOBELISCO_HEARTBEAT — HEALTH, STATE, THREATS, self-watch |
| `metabolism/` | DEFENSE_BUDGET — sensores ativos por risco |
| `sensors/` | 10 sensores — sinais, não decisões |
| `memory/` | Short / Mid / Long + origem, contexto, eficácia |
| `threat/` | THREAT-FP-XXXXXXXX fingerprints |
| `rules/` | Rule Engine — 15 regras AUTH→SYSTEM |
| `risk/` | L0–L3 — sem reparo financeiro auto |
| `remediation/` | Auto-repair reversível only |
| `validation/` | Guardian + Circuit Breaker (3 falhas) |
| `fortress/` | NORMAL → FORTRESS |
| `audit/` | Hash chain append-only |
| `immune/` | PREVENT → CONTAIN → REPAIR → VALIDATE |
| `antibodies/` | Anticorpos ligados a regras |
| `learning/` | Insights determinísticos da memória |
| `storage/` | LabPersistence in-memory (espelha hb_hobelisco_*) |
| `financial/` | Barreira absoluta ledger/crédito |

---

## Leis imutáveis (9)

Ver `dna/invariants.ts` — inclui `INVARIANT_MIGRATION_VERSIONED`.

---

## Arena V1

10 cenários oficiais `SIM-*` + **1000 micro-simulações** (100 × 10).

```bash
npm run lab:hobelisco-arena
```

Fluxo evolutivo:

```
INCIDENTE → HIPÓTESE → ARENA → 1000 SIMS → PASS? → CANARY → PRODUÇÃO
```

(CANARY/PRODUÇÃO ainda não implementados — roadmap V6+.)

---

## UI Lab

`/lab/hobelisco` — painel futurista + Canal Hobelisco (diálogo estruturado, não LLM).

Gate: `HB_HOBELISCO_LAB_ENABLED` (fail-closed em prod).

---

## Limitações honestas V1

- Sensores simulados — não leem Supabase prod  
- Persistência in-memory — SQL em `schema/hb_hobelisco_lab.sql` é referência  
- Learning = agregação determinística, não ML  
- Diálogo = templates sobre snapshot  
- Zero hooks em rotas produtivas HB  

---

## Roadmap evolutivo

| Versão | Foco |
|--------|------|
| V1 ✅ | Organismo vivo (lab) |
| V2 | Memória imunológica persistida |
| V3 | Anticorpos promovidos via PR |
| V4 | Previsão de risco |
| V5 | Arena evolutiva ampliada |
| V6 | Canários |
| V7 | Políticas auto-fortalecidas (observe-only) |
| V8 | Ecossistema HB |
| V9 | Autonomia controlada |

---

## Referências

- `docs/adr/ADR-HOBELISCO-001.md`
- `lab/hobelisco-hx/docs/AUDITORIA-POS-V1.md`
- `lab/hobelisco-hx/docs/AUDITORIA-PARA-GPT.md`
