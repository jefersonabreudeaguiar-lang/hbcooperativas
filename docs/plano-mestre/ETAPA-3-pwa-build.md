# Plano mestre — Etapa 3: PWA / build alinhado (sem loop pós-deploy)

**Build alvo:** 551+

## Problema

Após cada deploy, `operacionalSyncedBuild` ≠ build atual → fila pós-deploy + integrity probes repetidos, mesmo com **bundle já v550** e dados locais ok → sensação de tela presa / sync eterno.

## Correção

- Com bundle **igual à nuvem**, grava `build-seen` e `operacionalSyncedBuild` se há fatia financeira local.
- Probe de integridade marca release visto quando não precisa align (menos reload).
- Badge e **Atualizar** chamam `ackCooperadoPwaReleaseWhenCanonicalMatch`.

## Aceite

1. **Reparar atalho** → login → header **verde** `v551` (sem `v551→552` se já atualizado).
2. Abrir app 3x seguidas — **não** aparece `sync…` amarelo sem motivo.
3. Valores financeiros **permanecem** após reabrir.
4. Se ainda `v antigo→v novo` vermelho: **Atualizar** uma vez → verde.

| Etapa 3 | ☐ SIM / ☐ NÃO |
