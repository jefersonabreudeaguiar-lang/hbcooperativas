# HB Credit Watch + Playbooks

## Visão geral

HB Credit Watch é uma camada **read-only** de observação sobre contas `hb_credit_*`.
Playbooks são roteiros **determinísticos** exibidos somente após confirmação humana de incidente.

```
OBSERVE → CORRELATE → ALERT → HUMAN DECIDES → HUMAN EXECUTES → LEARN
```

**HB Credit Watch é somente observação. Hobelisco não possui autorização para alterar estado financeiro.**

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `HB_HOBELISCO_CREDIT_WATCH_ENABLED` | `false` | Master switch do scheduler/probe |
| `HB_HOBELISCO_CREDIT_WATCH_INTERVAL_MINUTES` | `15` | Intervalo (5–1440) |
| `HB_HOBELISCO_PROBE_COOP_CNPJ` | — | CNPJ único (compat) |
| `HB_HOBELISCO_PROBE_COOPS` | — | Lista separada por vírgula |
| `HB_HOBELISCO_V2_ENABLED` | `false` | Observer V2 necessário |
| `HOBELISCO_ENVIRONMENT` | — | `STAGING` ou `LAB` (nunca `PRODUCTION`) |

## Arquitetura

```
Scheduler (/api/cron/hobelisco-credit-watch)
    → runHbCreditWatch()
        → SELECT hb_credit_accounts (read-only)
        → Integrity rules A–E
        → Snapshots + findings (dedup fingerprint)
        → CorrelationEngine (existente)
        → INCIDENT_CANDIDATE
```

## Regras de integridade

| Regra | Condição | Evento | Severidade |
|-------|----------|--------|------------|
| A | `available !== limit - used` | `credit_integrity_divergence` | WARNING |
| B | `used > limit` | `credit_integrity_over_limit` | CRITICAL |
| C | `limit < 0` | `credit_integrity_invalid_limit` | CRITICAL |
| D | `used < 0` | `credit_integrity_invalid_used` | CRITICAL |
| E | `available < 0` | `credit_integrity_invalid_available` | CRITICAL |

Erros de leitura → `credit_probe_execution_error` (fail-closed, nunca `OK` falso).

## Snapshots e deduplicação

Tabelas de observabilidade (não financeiras):

- `hb_credit_probe_snapshots`
- `hb_credit_probe_findings`
- `hb_hobelisco_incident_outcomes`

Fingerprint estável: `hash(coop + account + eventType + expected + observed)`.

Mesma divergência → 1 finding ativo + N observações correlacionadas.

## Playbooks

Registry em `src/lib/lab/hobeliscoPlaybooks/registry.ts`.

| eventType | Playbook |
|-----------|----------|
| `credit_integrity_divergence` | Divergência HB Créditos |
| `credit_integrity_over_limit` | Crédito acima do limite |
| `credit_probe_execution_error` | Falha de observação |
| `auth_failure` | Burst de autenticação |
| `sync_ficha_pull_failure` | Sync ficha |

**Somente após `CONFIRMED`.** `DISCARDED` e candidatos não exibem playbook operacional.

## Outcomes

| Valor | Label |
|-------|-------|
| `RESOLVED` | Resolvido |
| `FALSE_ALARM` | Falso alarme |
| `ESCALATED` | Escalado |
| `STILL_INVESTIGATING` | Ainda em investigação |

Learning registrado como `PROPOSED` — sem auto-ajuste de thresholds.

## Scheduler

- Cron: `GET /api/cron/hobelisco-credit-watch` (Bearer `CRON_SECRET`)
- Manual LAB: `POST /api/lab/hobelisco/credit-watch`
- Fail-closed se `HB_HOBELISCO_CREDIT_WATCH_ENABLED=false`

## Validação

```bash
npm run lab:hobelisco:credit-watch
```

Aplicar migration:

```bash
psql $DATABASE_URL -f lab/hobelisco-hx/schema/hb_credit_watch_observability.sql
```

## Limitações

- Repositório in-memory para snapshots/findings até migration aplicada no Supabase staging
- Cron requer configuração explícita em `vercel.json` + secrets
- Não executa correções financeiras em nenhum cenário
