# Cooperado — leitura financeira ao vivo (AppData)

## Modo atual recomendado (produção) — BIC padrão

| Variável | Valor |
|----------|--------|
| `NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL` | `true` |
| `NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE` | `false` |

Mobile cooperado: snapshots materializados da BIC + até **3 syncs por sessão** (`cooperadoBicMobileSessionSync.ts`).

## Modo legado AppData direto (rollback)

| Variável | Valor |
|----------|--------|
| `NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE` | `true` |

**Efeito:** Início, Financeiro e paridade cooperado usam `leituraFinanceiraParidadeCooperado` + motores legados sobre o **AppData** após sync. A UI **não** passa pela autoridade BIC (`isBicCentralReadAuthorityEnabled` retorna `false` enquanto LIVE estiver `true`).

HB Créditos (limite na nuvem, `sync-limite`, ledger) **não** é desligado — só a camada BIC de exibição do valor a receber.

## Retrocesso — voltar ao modelo BIC na UI

1. Vercel → Environment Variables → Production:
   - `NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE` = `false`
   - Manter `NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL` = `true`
2. Redeploy (ou push em `main`).

Dados na nuvem **não** mudam.

## Alternativa (rollback antigo documentado)

`NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL=false` — ver `GO-APP-OFICIAL-ROLLOUT.md`.
