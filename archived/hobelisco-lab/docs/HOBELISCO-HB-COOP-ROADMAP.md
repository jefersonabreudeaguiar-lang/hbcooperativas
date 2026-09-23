## Entrega LAB-HARDENED — HB Credit Watch + Playbooks (2026-09-09)

| Item | Status |
|------|--------|
| HB Credit Watch (read-only) | ✅ Regras A–E, snapshots, dedup |
| Scheduler cron | ✅ `/api/cron/hobelisco-credit-watch` (flag OFF default) |
| Playbooks determinísticos | ✅ Somente após CONFIRMED |
| Outcomes humanos | ✅ RESOLVED / FALSE_ALARM / ESCALATED / STILL_INVESTIGATING |
| Audit LAB-HARDENED | ✅ `npm run lab:hobelisco:credit-watch` → GREEN 13/13 |

---

| Item | Implementado |
|------|----------------|
| Wire sync events | `CooperativaSyncProvider` → `reportHobeliscoSyncEvent` → ingest V2 |
| Middleware ingest | Chamada direta (sem HTTP round-trip / 401) |
| `/admin` → Hobelisco | Seção no portal criador + badge alertas |
| Alertas ≥70% | UI Command Center + Admin + audit `incident_alert` |
| RBAC admin | `/api/admin/hobelisco/*` com JWT + `requireAdminRole` |

---

| Sintoma | Causa | Correção |
|---------|-------|----------|
| `SAFE_MODE → SAFE_MODE` na Life Timeline | Death cycle falhava a partir de SAFE_MODE e registrava loop | `runDeathCycle()` recupera SAFE_MODE→WATCHING e percorre ciclo completo |
| Transição inválida silenciosa | `recordLifeTransition` aceitava from=to | Ignora transições idênticas |
| UI antiga (V2 panel separado) | Cache / dev server não reiniciado | Command Center em `/lab/hobelisco` — reiniciar `npm run dev` + hard refresh |

**V2 observer estava OK:** Persistência OK, INTEGRITY 100%, 11/11 persisted.

---

## O que JÁ existe (evidência)

### LAB (completo)
- Organismo digital: percepção, memória, defesa, morte, reincarnação
- 10.000 sims full-core, closure GREEN, hardened GREEN
- Timeline, replay, snapshot, arena

### V2 Observe-only (operacional no staging)
- Captura API/auth via middleware
- Probes read-only HB Credit + Sync
- Persistência Supabase (`hb_hobelisco_*`)
- Painel incidentes (confirmar/descartar humano)
- Command Center UX

---

## O que FALTA para Hobelisco no HB Coop real

### Fase A — Observação contínua (V2 produção/staging)
| Item | Status | Descrição |
|------|--------|-----------|
| Schema Supabase | ✅ | 9 tabelas aplicadas |
| Observer runtime | ✅ | Pipeline + persistência |
| Auto-capture middleware | ✅ | API + 401 auth |
| Dashboard incidentes | ✅ | Confirmar/descartar |
| Wire sync events | ✅ | CooperativaSyncProvider → ingest V2 |
| Wire HB Credit reads | ✅ | HB Credit Watch + scheduler + cron |
| Playbooks | ✅ | Registry determinístico pós-CONFIRMED |
| Outcomes | ✅ | Registro humano + learning PROPOSED |

### Fase B — Painel operacional HB Coop
| Item | Status | Descrição |
|------|--------|-----------|
| Rota admin `/admin/hobelisco` | ✅ | Seção Hobelisco no portal criador |
| RBAC operador | ✅ | JWT + `requireAdminRole` nas APIs admin |
| Timeline unificada LAB+real | ⬜ | Mesma UX, fontes distintas |
| Export audit PDF/JSON | ⬜ | Evidência para compliance |

### Fase C — Ação assistida (NUNCA automática)
| Item | Status | Descrição |
|------|--------|-----------|
| Sugestões de defesa | ✅ | Playbooks determinísticos |
| Playbooks | ✅ | Após CONFIRMED — auth/sync/credit |
| Outcomes | ✅ | RESOLVED/FALSE_ALARM/ESCALATED/STILL_INVESTIGATING |
| Integração fortress | ⬜ | Modo defensivo no app após confirmação humana |
| Rollback automático | ❌ | Proibido por design |

### Fase D — Produção (futuro distante)
| Item | Status | Descrição |
|------|--------|-----------|
| Observer em PRODUCTION | ❌ | Bloqueado — `OBSERVER_DISABLED` |
| Mutação automática | ❌ | Proibido |
| ML/predição | ❌ | Fora de escopo |

---

## Como seria a AÇÃO do Hobelisco no HB Coop

Princípio: **PERCEBER → CORRELACIONAR → SUGERIR → HUMANO DECIDE → HUMANO EXECUTA**

```
HB Coop (app + Supabase)
        │
        ▼ read-only
   SENSORES V2
   · API latency/errors
   · Auth failures
   · Sync conflicts  
   · HB Credit integrity (SELECT)
   · DB health
        │
        ▼
   MEMÓRIA + THREAT DNA
   (persist hb_hobelisco_*)
        │
        ▼
   CORRELAÇÃO
   INCIDENT_CANDIDATE
   (nunca auto-confirm)
        │
        ▼
   PAINEL OPERADOR
   ┌─────────────────────┐
   │ Incidente #42       │
   │ 8 auth failures     │
   │ Confidence 72%      │
   │                     │
   │ [Confirmar] [Descartar] │
   └─────────────────────┘
        │
        ▼ se humano confirmar
   SUGESTÃO DE AÇÃO
   · "Revisar logs auth coop X"
   · "Verificar sync dispositivo Y"
   · "Auditar conta HB credit Z"
        │
        ▼
   OPERADOR EXECUTA
   no HB Coop (manual)
        │
        ▼
   Hobelisco REGISTRA
   outcome + learning PROPOSED
```

### Exemplos concretos no HB Coop

| Cenário | Hobelisco faz | Hobelisco NÃO faz |
|---------|---------------|-------------------|
| 10 login failures | Correlaciona, cria candidato, alerta operador | Bloquear usuário |
| Divergência HB Credit | Probe SELECT detecta, incidente L3 | Corrigir saldo |
| Sync error burst | Observa, correlaciona por coop | Reprocessar sync |
| API 500 spike | Registra, fingerprint THREAT-FP | Reiniciar serviço |
| Ataque financeiro simulado | FinancialGuard bloqueia no LAB | N/A em observe-only |

### Estados do operador

1. **Normal** — Observer ON, 0 incidentes, integridade 100%
2. **Investigar** — Candidato aparece, operador analisa timeline
3. **Confirmar** — Humano valida ameaça real
4. **Agir** — Operador executa no HB Coop (fora do Hobelisco)
5. **Aprender** — Hobelisco registra outcome (PROPOSED insight)

---

## Próximo passo recomendado (ordem)

1. **Reiniciar dev** → ver Command Center + timeline death cycle corrigido
2. **Wire sync events** — capturar erros reais do fluxo sync do app
3. **Rota `/admin/hobelisco`** — painel operador fora do lab
4. **Notificação** — alerta quando incidente candidato confidence > 70%
5. **Playbook manual** — documento "o que fazer quando Hobelisco alerta X"

---

## Critério de sucesso HB Coop

> Hobelisco provou que **observa o sistema real sem colocá-lo em risco**, correlaciona sinais, persiste evidência auditável, e **sempre** exige humano antes de qualquer ação que afete cooperados, crédito ou sync.

Não declarar: invulnerável, 100% seguro, autônomo total.
