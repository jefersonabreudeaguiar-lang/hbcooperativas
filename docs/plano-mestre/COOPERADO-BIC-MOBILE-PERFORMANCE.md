# Cooperado mobile — BIC como fonte principal (performance)

**Princípio:** a UI lê **projeção BIC** (`cooperadoLeituraFinanceiraExibicao` → `bicLeituraPorta`). O AppData completo e a nuvem alimentam o BIC **fora** do frame crítico (sync automático / aba ativa).

## Regras

1. **Sync na nuvem** — controlado (2ª entrada piloto; «Atualizar» GA). Não `operacional_full` na abertura.
2. **Materialização BIC** — só via `scheduleCooperadoBicMaterializacaoProtegida` (`cooperadoBicMaterializacaoPerf.ts`): `yield` + idle híbrido + quiescência de troca de aba + serialização (uma passada por vez).
3. **Telas** — leem **snapshots** (card, ficha, entregas, preços); não assinam AppData global no PWA mensageiro.
4. **Piloto Jeferson** — uma aba por vez (`cooperadoJefersonAbasDadosReais.ts`); `persistirCooperadoPwaMessengerCaches` bloqueado (evita pacote inteiro).
5. **Abertura BIC** — `scheduleCooperadoBicMobileSessionSync` não roda no piloto «só automático»; demais GA usa materialização protegida.

## Promoção GA

Mesmas regras ao ampliar para todos os cooperados mobile — só mudar escopo do piloto, não duplicar caminhos pesados.

## Rollback

Desligar serialização/idle: `scheduleCooperadoBicMaterializacaoProtegida` pode chamar `run` direto em emergência (evitar em produção).
