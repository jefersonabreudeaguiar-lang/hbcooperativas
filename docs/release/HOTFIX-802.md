# 802 — entrada do responsável com sincronização concorrente

Falha observada na janela normal do Chrome em produção 800: tela de entrada com “Não foi possível atualizar — Aguarde a conclusão da conferência e tente novamente”. O mesmo bloqueio era usado tanto para uma conferência real quanto para qualquer lote de sincronização em segundo plano. A tentativa podia terminar durante esse lote e ser recusada repetidamente.

A entrada agora reserva prioridade antes de consultar a nuvem. Novos trabalhos do sincronizador e do aquecimento coletivo HB aguardam a próxima oportunidade. Escritas já iniciadas terminam normalmente; a entrada espera antes de ler e de reconciliar, com cancelamento e limite de tempo. Nenhum contador de lote é zerado à força, nenhuma fila é descartada e nenhuma confirmação de pagamento é modificada.

Base: commit oficial 24fc60351438c5492bc0b77f8645d72a2355d255 (800). Este pacote não contém a cobrança da candidata 801, que permanece em homologação.

Verificações: teste de concorrência, timeout, cancelamento, liberação da prioridade e preservação de lotes; regressões da entrada, conciliação, pagamentos, HB Créditos e imagens. Sem credenciais financeiras reais nos testes. Não exige migration nem limpeza do navegador. Rollback apenas de código para 800, preservando os registros na nuvem.
