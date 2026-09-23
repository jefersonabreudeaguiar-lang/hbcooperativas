# Hobelisco + Lab (arquivado)

Conteúdo do observador **Hobelisco**, scripts de **lab** e documentação relacionada, removidos do app de produção em set/2026.

## O que ficou no app

- Reconciliação read-only de HB Créditos continua em `src/lib/security/creditReconciliation.ts`, com regras mínimas em `src/lib/security/hbCreditReconciliation/`.
- Cron **`/api/cron/credit-reconciliation`** (não confundir com o cron Hobelisco credit-watch, também arquivado).

## Conteúdo desta pasta

| Pasta / arquivo | Descrição |
|-----------------|-----------|
| `src-lib-lab/lab/` | Biblioteca Hobelisco (observer, credit watch, gates, etc.) |
| `scripts-lab/` | Scripts CLI (`run-hobelisco*.ts`, audits, arena) |
| `components-admin/` | Painel admin Hobelisco |
| `api-cron-hobelisco-credit-watch/` | Rota cron Hobelisco |
| `docs/` | ADR e runbooks Hobelisco |
| `lab-reports/` | Relatórios gerados pelo lab |
| `lab-mirror-ui/` | Snapshot opcional de UI mirror (páginas `/lab`, badges) |

## Reativar (homologação apenas)

1. Restaurar `src/lib/lab/` a partir de `src-lib-lab/lab/`.
2. Restaurar `scripts/lab/` a partir de `scripts-lab/` (ou apontar `package.json` para paths em `archived/`).
3. Recolocar rotas em `src/app/api/...` e páginas admin/lab conforme snapshot em `lab-mirror-ui/` ou commit histórico.
4. Reintegrar middleware (auto-observer), `CooperativaSyncProvider` (sync reporter) e seção **Hobelisco** no `/admin`.
5. Não habilitar flags de observer/staging em produção sem revisão de segurança (`hobeliscoLabBoundary`, env flags).

Scripts npm `lab:*` e `hobelisco:*` foram removidos do `package.json`; invoque com `npx tsx archived/hobelisco-lab/scripts-lab/<script>.ts` se precisar rodar localmente.
