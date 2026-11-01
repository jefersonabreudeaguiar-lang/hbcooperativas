# Plano de correção do responsável

Atualizado em 01/11/2026. Cada etapa exige conferência na nuvem, teste do fluxo e verificação da versão em produção antes de ser considerada concluída.

## Contratos e preços — etapa atual

Catálogo PNAE recuperado do backup de 21/10/2026: 33 itens. Os 759 itens encontrados nas entregas da tabela da nuvem mantêm preços iguais aos do backup. O identificador original do contrato e dos produtos foi preservado; o cadastro vazio duplicado recebeu exclusão lógica. Estado anterior salvo em backup local. Entregas, pagamentos e descontos não foram regravados.

Versão 773: consulta exclusiva do catálogo, atualização ao abrir Preços, proteção contra publicação vazia e recuperação de contrato quando a publicação é posterior à exclusão local. Exclusões posteriores continuam valendo. A conferência visual dos dois perfis deve acompanhar a publicação.

## Ordem de execução das próximas etapas

1. **Pagar cooperados e Em aberto.** Cruzar os 38 pagamentos conhecidos com fichas e entregas por pessoa, cooperativa e período. Investigar registros pagos reaparecendo e linhas duplicadas do mesmo titular. Uma nova entrega posterior ao pagamento deve continuar em aberto. Comprovantes e valores históricos devem permanecer preservados. Aceite: nenhuma entrega quitada no saldo pendente; totais iguais no Início, Em aberto, Pagar e cooperado, com descontos discriminados.
2. **Conferir entregas e Adicionar imagens.** Validar seleção de cooperado, upload, repetição após falha, fila, conferência e criação de uma única ficha. Conferir rejeição/cancelamento sem lançamento indevido e preço vigente do contrato. Aceite: imagem vinculada ao titular correto; lançamento único; resumo financeiro atualizado após confirmação.
3. **Livro caixa, financeiro e HB Créditos.** Conciliar pagamentos, débitos avulsos, descontos e estornos. Aceite: cada movimento tem origem, data e descrição; nenhuma cobrança duplicada; o crédito ou desconto aparece no saldo correto.
4. **Cooperados e perfil da cooperativa.** Revisar cadastros repetidos, vínculo com conta, cooperativa e permissões. Aceite: cada titular tem uma apresentação consistente sem perder histórico; cooperado acessa somente seus dados.
5. **Relatórios, prestação de contas e fechamento.** Usar a mesma base financeira das telas operacionais; validar filtros, períodos e exportações. Aceite: totais conciliados e fechamento sem divergência entre telas.
6. **Mensalidades, avisos, votações e demais opções visíveis.** Conferir autorização, persistência, estados vazios, mensagens de falha e retorno após atualizar. Aceite: cada ação confirma o resultado real e não altera dados de outra cooperativa.
7. **Navegação e revisão final.** Medir troca de abas no celular e computador, carregamento inicial, atualização de versão e retorno após queda de conexão. Repetir o percurso completo responsável → cooperado. Aceite: sem tela branca, travamentos persistentes ou perda de preenchimento nas abas retidas; eventuais limites documentados.

## Critério para liberar cada etapa

Salvar ponto de retorno, reproduzir o problema, corrigir a causa, executar testes relacionados, publicar e conferir o resultado real. Não registrar pagamentos fictícios nem apagar movimentações reais para testar. Se faltar evidência, manter a etapa pendente e informar exatamente o que falta.
