# Release 800 — sincronização e conciliação do contador

Base: produção 799 `c704c94998e80159e838d751e61bf41e24655e49`.

## Correções

- Contador passa pela confirmação completa da nuvem antes de visualizar valores.
  Cache próprio, por CNPJ e perfil; não herda o arquivo global nem o fallback da gestão.
- Login e entrada antiga em `/dashboard` encaminham para a central. O guard permite
  a árvore de consulta `/contador` ao perfil ativo, sem convertê-lo em gestão nem
  liberar rotas de operação.
- Parecer em modo consulta não confunde permissão de exportar com permissão de
  editar, nem promete salvar uma alteração que a API somente leitura recusaria.
- Atualização do contador usa somente leitura, sem sync bidirecional ou materialização
  de descontos HB. Revisão leve a cada minuto, ao voltar à janela e ao recuperar
  conexão provoca nova confirmação quando necessário. Falha não é reconhecida como
  dado atualizado. A tela mostra o momento da última confirmação.
- Contabilidade recebe as coleções originalmente salvas na nuvem. Não gera lançamentos
  do Livro Caixa para fazê-los parecer conciliados durante a consulta.
- Conciliação compara bruto com débito bruto. Valor líquido fica separado no painel.
  Pagamentos e retenções usam a data efetiva do pagamento; entregas e saldo pendente
  usam competência. Um recibo multi-mês aparece uma única vez no demonstrativo de caixa.
- Taxa, mensalidade retida e outros descontos são conferidos pelo vínculo do pagamento,
  sem adicionar novamente os descontos da ficha. Origens duplicadas ou ausentes
  continuam gerando divergência, mesmo com total agregado aparentemente igual.
- Pagamentos aguardando confirmação ficam fora dos valores confirmados.
- Dossiê, demonstrativo e lista de meses respeitam a cooperativa selecionada.
- Saldo já quitado não sofre uma segunda subtração. Pendências reais continuam abertas.
  Informação HB sem confirmação independente do ledger permanece parcial.

## Verificação e limites

Testes abrangem bruto/líquido, datas, recibos multi-mês/duplicados, falhas de vínculo,
isolamento entre cooperativas, cache, atualização por revisão, permissões e preservação
de pagamentos. Validar login real com contador fictício exclusivamente na homologação;
desativar a conta e invalidar a senha ao concluir. Sem testes financeiros na produção.

A leitura dos registros oficiais confirmou o vínculo dos pagamentos confirmados com
débitos brutos, taxas e retenções do Livro Caixa. Conciliação por mês de caixa de setembro,
outubro e novembro passou nessas categorias.

Continuam existindo diferenças documentais entre notas e fichas históricas de agosto,
setembro e outubro. A release não reescreve esses documentos, preços ou recibos, e não
declara que todos os documentos históricos estão conciliados. Não foi validada uma
escrituração fiscal oficial nem emitida certificação da OCB.

Sem migration ou alteração de lançamentos oficiais. Publicar o mesmo SHA testado
primeiro na homologação e depois no projeto oficial; conferir identidade e impressão
digital dos dados antes/depois. Retorno de tráfego à 799:
`dpl_FZyCTTmCigaRg8kr6taxM2vkaAkV`. Nunca restaurar JSON antigo sobre novos pagamentos.
