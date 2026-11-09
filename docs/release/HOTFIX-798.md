# Hotfix 798 — itens e HB quitados na visão em aberto

Base: release oficial 797, código `74c612de4a4262cb2ce358658f521bc906895bdb`.
O proprietário relatou entregas pagas na seção Ficha e movimentos acertados na
seção Financeiro → HB Créditos. A tela principal da conta HB não faz parte deste ajuste.

## Correção

- A lista vazia de itens em aberto deixa de ser substituída pelo cache antigo.
- IDs de fichas/notas de pagamentos confirmados da própria sessão permitem uma
  projeção local de quitação mesmo antes da atualização completa do AppData.
  Essa projeção nunca é gravada. Novas entregas fora dos IDs pagos continuam abertas.
- Na seção HB do Financeiro, a API recebe `somentePendentes=true` e compara os
  movimentos com descontos registrados nos pagamentos confirmados do arquivo
  operacional. Identificador da transação prevalece; referência legada exige código
  de recibo e valor iguais. Compra posterior ao pagamento não é ocultada.
- Acerto parcial mostra apenas o restante; estorno posterior continua como crédito
  pendente até haver prova de quitação. Pagamento não confirmado não quita movimento.
- Consulta histórica sem o parâmetro mantém a lista original. Recibos, extrato,
  pagamentos, lançamentos do Livro Caixa, limites e saldo HB não são regravados.
- Nova revisão de pagamentos dispara a releitura do HB na tela aberta. Resposta
  é privada e sem cache; falha ao conferir pagamentos retorna 503 em vez de supor
  que um movimento está aberto ou quitado.

## Verificação

20 suítes locais passaram, incluindo API real do módulo com mocks de nuvem,
reconciliação de cache, nova entrega após quitação, duplicidade de pagamento,
acerto parcial, estorno, isolamento de proprietário e preservação do histórico.
Checagem de tipos passou. Gate de preservação dos fluxos existente será registrado
com o build e a conferência da homologação antes da publicação.

Uma leitura dos registros oficiais do cooperado afetado confirmou que os movimentos
reclamados tinham vínculo de quitação e ficaram fora da projeção de pendências.
Nenhum dado individual ou valor dessa leitura foi salvo neste repositório.

## Publicação

Branch `codex/hb-release-798-ready`, build 798 no app/SW. Guard permite somente
Preview no projeto/banco de homologação ou Production no projeto/banco oficiais.
Sem migration. Conferir arquivo operacional antes/depois e endpoints protegidos.
Retorno de tráfego: produção 797 `dpl_3F2SkTkp8dUuT1dEKgkxjfh27b7c`;
não restaurar JSON antigo sobre novos lançamentos.
