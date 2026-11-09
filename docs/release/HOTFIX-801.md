# Candidata 801 — cobrança da plataforma

Regra confirmada pelo proprietário: novas cooperativas vencem no aniversário do ciclo. Datas e preços de cobranças já emitidas permanecem preservados. Dias 29–31 usam o último dia de meses curtos e retomam o aniversário no mês seguinte. Datas são interpretadas no fuso America/Fortaleza.

O administrador consulta cooperativas e cooperados diretamente da nuvem, sem depender da lista armazenada neste aparelho. A falha de uma leitura impede apresentar um total incompleto como saldo zero. A consulta não emite PIX nem grava cobranças. O resumo soma os ciclos emitidos ainda não confirmados; a cobrança mais antiga continua acessível após a virada do ciclo. Quantidades e valores de documentos emitidos ficam congelados.

No HB Créditos, o cartão inicial passa a apresentar a parcela do desconto já liquidada e ainda não repassada, considerando todos os períodos. As alocações salvas continuam sendo a evidência dos centavos devidos; não se recalculam descontos históricos nem se aplica a porcentagem ao valor bruto da compra.

O responsável informa pagamento por uma ação autenticada no servidor. Somente o administrador pode confirmar ou recusar. As ações exigem o período exato e verificam a revisão da cooperativa antes de gravar. Um conflito retorna erro, sem confirmação otimista. A tela consulta novamente a nuvem e o aviso desaparece após confirmação persistida. O PATCH genérico do responsável não pode alterar cobrança SaaS.

## Validação realizada

- TypeScript sem erros.
- Testes de aniversário, fevereiro comum/bissexto, dia 31, fuso, dívida antiga, preços congelados e pagamento informado/confirmado.
- Teste de API com dependências simuladas: perfil, cooperativa, período obrigatório, conflito e falha de nuvem. Sem credenciais reais.
- Conferência oficial somente em leitura: 26 cooperados da CoopeagriPla, ciclo 20/10–19/11, vencimento 20/11, mensalidade já paga e saldo SaaS zero. Preços oficiais R$14,90 e mínimo R$290.

## Limites e implantação

Não migra dados, não altera preços oficiais e não confirma pagamentos reais durante testes. Nenhuma restauração de banco é necessária. Não cria cobranças retroativas de meses sem documento emitido. A liberação depende de build e conferência na homologação. A versão oficial anterior é 800; retorno de versão altera apenas código/tráfego e preserva os lançamentos.
