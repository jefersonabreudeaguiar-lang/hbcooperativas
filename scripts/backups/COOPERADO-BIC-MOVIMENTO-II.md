# Rollback — Concerto BIC Movimento II

## Desligar skip de reforço de sessão

Reverter commit ou remover chamadas a `shouldSkipCooperadoBicSessionReinforcementPull` em `cooperadoBicMobileSessionSync.ts` (reforços voltam a sempre chamar `light` pull).

## Leitura unificada

Migração para `cooperadoLeituraFinanceiraExibicao` é compatível com BIC off (`APPDATA_LIVE`); rollback de porta: `BIC-LEITURA-PORTA.md`.
