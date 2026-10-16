# Rollback — BIC Leitura Porta (Movimento I)

## Desligar só o hub (mantém BIC official)

```json
"NEXT_PUBLIC_BIC_LEITURA_PORTA": "false"
```

Cooperado volta a `resolveLeituraFinanceiraCooperadoCore` sem envelope; comportamento financeiro permanece BIC se `BIC_CENTRAL_READ_OFFICIAL=true`.

## Desligar uma superfície

- Cooperado: `NEXT_PUBLIC_BIC_LEITURA_PORTA_COOPERADO=false`
- Staff: `NEXT_PUBLIC_BIC_LEITURA_PORTA_STAFF=false`
- HB: `NEXT_PUBLIC_BIC_LEITURA_PORTA_HB_CREDITO=false`

Requer `NEXT_PUBLIC_BIC_LEITURA_PORTA` ≠ `false` (master habilitado).

## Voltar ao legado AppData-live (emergência)

`NEXT_PUBLIC_COOPERADO_FINANCEIRO_APPDATA_LIVE=true` — ver `COOPERADO-FINANCEIRO-APPDATA-LIVE.md`.
