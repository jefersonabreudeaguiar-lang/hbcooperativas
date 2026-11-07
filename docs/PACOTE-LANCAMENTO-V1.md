# HB Cooperativas V1 — pacote em validação

## Situação em 06/11/2026

O piloto `dpl_FHnw7FPyWTvv7SfwYiJ7JNLoTDzx` abriu com as contas fictícias
de cooperado e responsável no navegador. Início e Financeiro mostraram
R$ 100,00 para o cooperado de teste, inclusive após recarga e retorno ao
Início. O responsável concluiu a atualização da cooperativa fictícia.

A recarga preservou um rascunho de comunicado, mas perdeu o aviso de envio
pendente e desabilitou o envio. A correção passa a guardar a fila na cópia
local e só remove a geração confirmada pela nuvem. Falhas de publicação
passam a ser propagadas. O teste cobre recarga, outra cooperativa e edição
feita durante um envio. Tipos e teste passaram. A conferência da correção
na interface passou no piloto `dpl_AmBFEgYiD4b65jCLuumdGYd6yYiF`. A recarga
preservou texto, aviso de pendência e botão habilitado. As duas contas foram
desativadas novamente e suas senhas temporárias invalidadas.

O gate rápido passou em 82,4 segundos antes desse ajuste adicional. Também
passaram novamente os testes de leitura indisponível, API recuperável,
rebase, conflito/retomada simulada e ponte de retorno.

Os testes abaixo são histórico. A referência vigente de retorno é a 794.
Ainda faltam a compra/comprovante na interface, o cenário real de conflito
com recarga e o fechamento do ensaio das migrações. A versão final precisa
ser superior à 794. O teste de restauração física continua adiado por
decisão do proprietário. Este documento não autoriza publicação oficial.

O ensaio transacional reaplicou em ordem as 16 migrações financeiras e
executou 14 casos SQL com savepoints separados. Tudo passou e foi revertido.
As duas migrações de snapshot já instaladas foram validadas pelos testes,
sem recriar a tabela existente. A primeira tentativa de reaplicar também
essa criação falhou com `relation already exists` e foi revertida. Isso
comprova a necessidade de distinguir migrações já instaladas na publicação.
O ensaio não substitui uma migração sobre uma cópia física do banco oficial.

### Relato de pagamentos e transferências de 06/11

O proprietário observou valores diferentes no navegador normal e no anônimo,
lentidão ao registrar pagamento e repasses entre cooperados sem aparecer.
Preservar o lançamento avulso de Jeferson para Jovane. Não reaplicar essa
transferência, nem reconstruir saldos históricos automaticamente.

A rotina oficial de transferência soma o valor ao limite do destinatário.
O pacote possui uma rotina de saldo próprio com lançamentos de entrada e
saída, ainda bloqueada para uso. Sua ativação exige fechar a integração e
os testes da interface. Também foi encontrada uma saída antecipada no
leitor de descontos quando não existem compras de mercado, anterior à
consulta das transferências. O tratamento precisa distinguir transferências
novas das já compensadas manualmente.

Na candidata, a confirmação visual de pagamento passa a ocorrer depois de
a API aceitar o registro e antes das atualizações adicionais de notas,
painel e limite. Falha nessa atualização adicional mantém a confirmação
e informa a pendência. Falha sem resposta de confirmação orienta conferir
o registro antes de repetir. A causa da diferença normal/anônimo e a
integração dos repasses seguem em investigação e bloqueiam o OK final.

A confirmação visual antecipada está compilada na homologação
`dpl_7Gq3ovZWNmRMHYRRx5UJumXV3KMk`, commit
`d91de40603255038ce6a92052867eb14c4516720`. O gate rápido passou em 71 segundos.

Foi identificada uma configuração ausente nas leituras e gravações JSON do
Storage. Operacional, contratos e metadados de entregas passam a ser lidos
com `cache: no-store` e uma referência nova de cache por consulta. As
gravações desses JSON usam `cacheControl: 0`. As fotos preservam sua política
de cache. O teste confirmou a troca de entrega conferida para paga nas
leituras individual e em lote, além das recusas e retomadas já existentes.
Referência da API instalada e documentação consultada
https://supabase.com/docs/reference/javascript/storage-from-download.
Isso remove uma fonte possível de leitura antiga, sem comprovar sozinho a
causa da divergência normal/anônimo ou resolver a fusão dos dados locais.

### Continuação da correção dos saldos e repasses

Foram reproduzidos em testes dois caminhos de recuperação incorreta. No
pagamento HB, a mescla usava o máximo do QR e do cache e a normalização
podia elevar o disponível reduzido pelo servidor. Agora a mescla escolhe
uma leitura inteira da mesma conta pela data de atualização, com preferência
ao QR em empate ou data ausente. A normalização preserva o teto recebido.
Contas bloqueadas não ficam disponíveis por possuírem saldo próprio.

Na proteção do responsável contra dados vazios, o lastro podia sobrepor o
valor antigo ao registro atualizado de mesmo ID. A mescla agora prefere a
leitura recebida, respeitando datas anteriores quando ambas são conhecidas.
Os pagamentos usam a mescla monotônica já existente. O teste reproduziu
ficha antiga de R$ 999 e ficha paga de R$ 100, preservou R$ 100 e o pagamento
confirmado, manteve um lançamento manual ausente e recusou resposta antiga.

No fluxo de transferência em validação, a prévia passa a considerar saldo
próprio e crédito. Após a confirmação, crédito disponível e saldo próprio
são retornados separadamente. O total do RPC não deve ser somado outra vez
ao saldo próprio. Falha na releitura não invalida o comprovante nem inventa
um saldo. O leitor passa a consultar transferências novas mesmo quando
não há compras de mercado. Nesse caminho novo só usa o débito explícito
da operação, sem reconstruir transferências legadas sem esse campo.

Testes de saldo recente, isolamento, bloqueio, saldo próprio, confirmação,
PIN recusado, compensação legada e proteção de snapshots passaram.
A liberação de operações de saldo próprio continua desabilitada e depende
da validação autenticada da interface. Nenhuma transferência ou ajuste
avulso oficial foi regravado durante essa correção.

O deployment `dpl_6bGyUtYDiKP9SBaNdjxVswVTSGjP`, commit `730a12a1`,
compilou com essas correções. A verificação rápida passou em 79,6 segundos.
No ensaio de interface, o cooperado fictício abriu o Início com R$ 100 a
receber e a conta HB com R$ 3 de saldo próprio e R$ 0 de crédito. A cobrança
fictícia de R$ 1 mostrou corretamente o saldo projetado de R$ 2.

A digitação de um PIN de seis dígitos revelou confirmação antecipada antes
de terminar a entrada. O app enviou PIN parcial e retornou PIN inválido,
sem confirmar a compra. A tela foi ajustada para enviar somente pelo botão
Pagar. O teste inspeciona a entrada de confirmação e garante que ela pertence
ao clique, além de exercitar confirmação com falha local e recusa de PIN.

A liberação de saldo próprio passa a exigir duas configurações privadas,
`HB_OWNED_BALANCE_OPERATIONS_ENABLED=true` e `HB_OWNED_BALANCE_CNPJ` com o
CNPJ autorizado. Sem ambas, ou para outra cooperativa, continua fechada.
As chamadas de transferência, autorização e conversão informam o CNPJ.
Essa configuração permite o piloto fictício sem liberar operações oficiais.
Ainda não foi ativada no projeto oficial.

A fixture desta rodada é `hb_fixture_ui_20261106_receipt`, na cooperativa
sintética `88888888000181`. Conta HB criada com R$ 3 sintéticos, cobrança
interna de R$ 1 e mercado fictício temporariamente ativo. Nenhum aceite de
termo foi registrado, nem PIX ou serviço financeiro externo foi chamado.
Ao encerrar o ensaio, desativar a conta de login, invalidar os segredos de
teste e devolver o mercado a PENDING. Preservar a trilha fictícia de teste.

Referência atual de retorno em produção: build 794, commit
`252b7fa4512c105358613c5b7bb4160009249893`, deployment
`dpl_FdoEZyKoaUjgXm61AQYK6eaeJNyc`. A 793 publicou a melhoria de
conferência. A 794 acrescentou a recusa de sincronização com leitura
indisponível e o aviso de reenvio após falha de gravação. Ambas foram
publicações isoladas, sem migrações. As referências ao 792 e à 793 abaixo
descrevem a base em que as verificações anteriores foram feitas.

O commit `b36aaf83a867d8b4d1cc680660732d67bade8e2d` incorpora a resposta
recuperável da API e o aviso de falha da 794 no pacote completo. A
verificação de tipos, o teste de recusa e retomada da API e os testes do
fluxo versionado passaram nessa revisão.

Homologação verificada em 04/11/2026. Commit
`b3a0f814fdc295ea97ce5b0b81f6b2e91a2dc822`, deployment
`dpl_6Xwssfx8rweeGLaFxJa4YqUQ431Z`. O domínio oficial respondeu com build 792,
commit `7e366321606fd7d4e1f8dfbbca239fa2a27102de`, deployment
`dpl_A1XqjUhasvCyK4HA3UPBLaVueMxo`.

## Escopo

- Segurança de dependências, autenticação e rotinas financeiras.
- HB Créditos: limites em lote, base financeira, estornos, repasses e
  lançamentos permanentes no Livro Caixa.
- Cooperado e responsável: resumo financeiro, comprovante, folha de outubro
  no Em aberto e preparação da próxima foto durante a conferência.
- Sincronização: falhas de leitura bloqueiam gravações. Controle de versão e
  recuperação de edições ficam em teste, com a opção de ativação desabilitada.

## Evidências

- Vercel concluiu a compilação. A página de login carregou no navegador e
  `/api/client-release` confirmou o commit de homologação.
- `release:verify --fast` passou. As duas verificações que esperavam o JSON
  sem compactação foram ajustadas para checar o formato já usado pelo app.
- Testes do fluxo versionado com API e persistência simuladas passaram.
- Duas transações reais partiram da mesma revisão no Supabase de homologação.
  A segunda começou cerca de 257 ms após a primeira, antes de ela terminar.
  A primeira recebeu nova revisão e a segunda recebeu nulo. A consulta de
  limpeza confirmou que o conteúdo da primeira permaneceu salvo.

## Condições para apresentar o pedido de OK

1. Exercitar a sincronização com contas fictícias autenticadas e abas
   independentes. Conferir edição concorrente, recarga da página, retomada,
   falha de armazenamento e impossibilidade de ultrapassar um reset.
2. Validar no app os fluxos de responsável, cooperado e mercado. Medir
   Aprovar e próxima com fotos. Confirmar folha, recebível, compra, comprovante,
   pagamento e Livro Caixa com dados de teste.
3. Fechar a sequência de migrações com conferência de pré-requisitos e
   compatibilidade com a versão 792. O banco oficial não tem a tabela de
   histórico consultada no ambiente de teste. A comparação de funções mostrou
   6 assinaturas ausentes, 13 definições diferentes e 1 igual entre as
   20 funções inspecionadas em homologação. Usar objetos, assinaturas e
   privilégios reais como referência para o plano de produção.

## Sequência de publicação proposta

Após validação e OK explícito, guardar a identificação do deploy 792, conferir
backup e registrar os valores de controle. Aplicar somente as migrações
revisadas, em ordem de dependência, e publicar uma versão superior à 792 no
projeto oficial. O build da homologação usa o banco de teste e deve servir
como referência de código para o build oficial com configuração própria.
Conferir login, as três funções do app e os valores de controle após ativação.

Em caso de regressão, restaurar o tráfego para o deploy 792 somente com o
banco em estado compatível. Se uma migração substituir funções ou alterar
permissões usadas pelo 792, é necessário preparar a reversão específica do
schema. Reaplicar um backup integral poderia perder lançamentos posteriores.
O ensaio de restauração integral permanece adiado conforme combinado.

## Compatibilidade do retorno ao 792

- O código do 792 chama a autorização de pagamento com dez parâmetros, incluindo
  `p_cashback_applied_cents`. Essa assinatura existe nos dois bancos e aceita a
  execução pelo servidor. A migração de limpeza remove somente a assinatura de
  nove parâmetros. Isso confirma o encaixe da chamada do 792, mas a execução da
  operação pelo 792 com o esquema novo ainda precisa ser testada.
- Oito assinaturas de compra, estorno, repasse, liquidação, transferência,
  cashback e recebíveis em homologação mantêm execução para `service_role`.
  Sete assinaturas no oficial, contando a variante de nove parâmetros, ainda
  concedem execução aos perfis públicos. A consulta verificou permissões no
  catálogo do banco. Nenhuma chamada pública de escrita foi executada.
- Separar a mudança em três blocos. Primeiro, revisar tabelas, índices, colunas e
  privilégios. Depois, instalar as rotinas financeiras na ordem dos arquivos,
  exercitando o 792 no esquema resultante. Por fim, compilar e validar a nova
  aplicação. A ativação da gravação versionada exige um ensaio separado de
  retorno, pois o 792 lê o arquivo operacional legado.
- Se houver necessidade de reverter uma rotina, preservar as permissões
  exclusivas do servidor e os registros financeiros feitos depois da publicação.
  O plano ainda depende de um ensaio autenticado para validar esse caminho.

## Retomada dos testes

- Na homologação, a conta fictícia de responsável abriu Conferir entregas,
  Em aberto (3 cooperados, R$ 380,00 no cenário de teste) e Livro Caixa.
  O login do cooperado chegou ao painel. A inspeção do saldo e a interface do
  mercado ficaram pendentes devido à perda do controle do navegador.
- O teste automatizado de retomada descarta a referência em memória após uma
  recusa da nuvem e recupera a referência ligada à cópia local. A edição continua
  pendente e o reenvio conclui. A persistência do navegador foi simulada.
- Passaram no banco de homologação os testes de recebíveis por mercado,
  conversão de cashback e repasse. As transações de teste foram revertidas.
  Também passaram 39 invariantes sintéticas de alinhamento, a paridade entre
  Em aberto e Pagar e o teste de carregamento de fotos.
- As três contas fictícias foram desativadas. A candidata permanece em validação.
  A gravação versionada está desabilitada. Os testes autenticados de mercado,
  saldo do cooperado e duas sessões concorrentes continuam sendo condições
  para solicitar o OK de produção.

## Revalidação após a publicação isolada da 793

- A autorização com dez parâmetros usada pela 793, estorno, repetição
  idempotente, privilégios de execução, limites e revisão operacional
  passaram nas transações revertidas de homologação. Isso valida o contrato
  SQL da versão anterior, sem simular o retorno de tráfego do app.
- A gravação versionada exige agora o CNPJ explícito da cooperativa de
  teste. O ponto central também bloqueia reset ou limpeza de notas no modo
  versionado. Os testes cobriram o isolamento e a recusa.
- A sessão de navegador voltou a perder o controle antes do formulário
  autenticado. As três contas fictícias permanecem desativadas. A validação
  das telas de cooperado e mercado, a corrida no app e o ensaio de retorno
  da 793 seguem pendentes.

## Congelamento antes do retorno

A migração `20261104225255_hb_operacional_freeze_for_rollback.sql` foi aplicada
apenas em homologação. A rotina trava a revisão indicada pelo operador. Uma
revisão antiga não consegue congelar uma mais nova. Depois do congelamento,
uma gravação concorrente é recusada, mesmo que use a revisão correta.

O teste no banco congelou uma revisão que continha um lançamento e um
pagamento confirmado, tentou gravar novamente e confirmou que ambos
permaneceram na cópia congelada. A transação foi revertida.

Para ensaiar o retorno, isolar todos os escritores, inclusive deploys antigos
que ainda podem escrever no Storage. Congelar a última revisão, guardar uma
cópia do arquivo legado e publicar a revisão congelada no caminho legado
`{cnpj}/operacional.json`. Relê-lo e comparar o conteúdo antes de liberar a
793. Esta etapa ainda precisa ser exercitada com uma cooperativa fictícia.

O script `scripts/bridge-operacional-rollback.mjs` prepara o ensaio para o
CNPJ reservado `99999999999996` no Supabase de homologação. Recebe a revisão
congelada e, por padrão, só compara as assinaturas digitais do arquivo de
destino e do conteúdo preparado. Com a assinatura esperada do arquivo legado,
publica a cópia e confirma o conteúdo por releitura. A assinatura esperada
não substitui a pausa dos escritores, pois o Storage legado não oferece
gravação condicional nesse fluxo.

O teste local simulou destino alterado e divergência após upload. O ensaio
real no deployment de teste `dpl_FPdti5ZynteYDRoRvqSASMwt9gMP` publicou a
revisão congelada no Storage, confirmou os bytes, releu o pagamento e o
lançamento de caixa no formato legado e removeu a cópia. A consulta ao
inventário confirmou zero arquivos restantes e a revisão fictícia também
foi removida. O primeiro ensaio revelou cache após a remoção. A checagem de
existência agora usa o inventário. Ainda falta abrir a 794 sobre a cópia
restaurada para comprovar o retorno pela interface.

O deployment de ensaio `dpl_HZntLbRGKnwc6cDEZer4JRqqzcUt` executou a rota real
de sincronização com duas sessões fictícias autenticadas, CNPJ reservado e
banco de homologação. As duas leram a mesma revisão. Uma gravação retornou
201 e a outra 409. O reenvio, após releitura, preservou os dois lançamentos.
A revisão de teste foi removida. A recarga com edição pendente está coberta
por teste simulado e ainda precisa de validação no navegador.

## Rodada final de validação do servidor

- O ensaio `dpl_3evMbig1HYnXJviodNTkAFHwenmL` executou o leitor exato da
  794 contra a cópia restaurada no Storage de homologação. Leu o pagamento
  confirmado e o lançamento de caixa. A revisão e o arquivo fictícios
  foram removidos. O ensaio não redirecionou tráfego de produção.
- O ensaio autenticado de saldo encontrou R$ 0,00 no Início e R$ 100,00 no
  Financeiro no cenário fictício. O card passou a usar a leitura financeira
  compartilhada, com as notas do cooperado. O ensaio
  `dpl_3BMYo6xGgBSTjdUu8ys6XqJctm8r` confirmou a paridade após o ajuste.
- No banco de homologação, a repetição da compra fictícia devolveu o mesmo
  código de comprovante sem duplicar o débito. O teste do cliente confirmou
  a preservação da confirmação diante de falha local e a recusa do PIN errado.
- Restam a compra e o comprovante na interface, a recarga real do navegador
  após um conflito e a passagem pelo pacote de migrações com o app de retorno.
  A sincronização versionada segue desativada na candidata.
