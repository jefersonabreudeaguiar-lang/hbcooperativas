# Plano mestre — Etapa 4: sync estável (sem rajada)

**Build alvo:** 552+

## Mudança

- **Atualizar** com dados locais ok → `runCooperadoGaSyncBaseInformacoesFinanceiras` (uma trilha) em vez de `operacional_full` na fila global.
- **Pós-deploy** já reconhecido + release ack → não reenfileira `operacional_full` duplo.
- **Diag browser:** `/hb-cooperado-console-diag.js` + `await __HB_COOPERADO_DIAG_RUN__()`.

## Aceite

1. Com valores no Início, tocar **Atualizar** 3x em 30s — app continua clicável (sem spinner eterno).
2. Trace (`hb.coop.mobile.trace=1`): não deve haver rajada de `operacional_full` se `manual_atualizar` → `sync_base_financeira`.
3. Abrir/fechar app 3x — sem fila pós-deploy repetida se build já ack.

| Etapa 4 | ☐ SIM / ☐ NÃO |
