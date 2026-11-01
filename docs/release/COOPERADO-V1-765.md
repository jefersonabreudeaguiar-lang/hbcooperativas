# Cooperado V1 — Financeiro sem filas coletivas

Sintoma informado: abrir Financeiro trava o celular, enquanto as outras abas são rápidas.

## Problema identificado e correção

FichaCorridaContent é compartilhado entre cooperado e responsável. Quatro cálculos de filas do responsável eram executados também no render cooperado: cooperados com ficha, cooperados a pagar, pagamentos aguardando assinatura e recibos aguardando conferência. A lista de divisão também era preparada sem necessidade.

O build 765 calcula essas filas somente para responsável com a aba ativa. A visão cooperado mantém a própria leitura financeira, histórico e valores. Não há alteração de dados na nuvem.

## Evidências

- Teste de fronteira usa dados inacessíveis: cooperado e aba inativa não podem ler nenhuma propriedade do operacional coletivo.
- No mesmo teste, responsável continua recebendo filas de assinaturas e recibos; trocar para cooperado não reaproveita a fila anterior.
- Testes de exibição financeira (5 cenários), fluidez e painel do responsável passaram.
- A melhora efetiva no celular depende da confirmação do usuário; esta correção remove um processamento indevido comprovado, sem presumir que todos os possíveis gargalos foram eliminados.

Avaliação: abrir Financeiro no build 765, alternar entre as abas e confirmar SIM/NÃO para fluidez e manutenção dos valores.
