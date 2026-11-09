# Candidata 797 — pacote selecionado para aprovação

Base exata: produção 795, commit `493f584ba708a3496bae11eb994433c05ba198d8`.
Branch `codex/hb-release-797-ready`. A versão 796 de escala não será promovida.

## Candidata atual após reorganização do financeiro — 08/11/2026

O SHA atual para aprovação é `74c612de4a4262cb2ce358658f521bc906895bdb`,
deployment de homologação `dpl_4Gc9h2LSnjcRpit2cgTpv6cw6y4s`, READY:
https://hbcooperativas-homologacao-v1-kwl984uqd-hbcooperativas.vercel.app
Substitui a seleção anterior `41c34a25`, preservada abaixo como evidência histórica.
A publicação oficial permanece aguardando OK do proprietário.

A API de financeiro já existente passa a retornar também os pagamentos confirmados
do próprio cooperado, sem HTML do recibo, assinatura ou dados bancários. A tela
separa A receber agora, Último pagamento e Recebido no histórico, com meses e
descontos para conferência. Essa seção funciona mesmo enquanto o AppData local
ainda não carregou; uma ficha quitada não fica limitada à apresentação de zero.
O cache da leitura compara também o histórico para perceber novos pagamentos
mesmo quando o saldo pendente continua zero. Não há escrita em dados financeiros.

18 suítes locais, checagem de tipos e release verify rápido passaram. O novo teste
cobre isolamento de cooperativa/cooperado, deduplicação de PIX multi-mês, ausência
de recibo/assinatura no payload, apresentação quitada e com nova entrega pendente.
Uma leitura do novo modelo com dados oficiais confirmou a separação dos valores,
sem gravar a consulta nem exportar dados individuais para o repositório.

Na interface, a conta fictícia mostrou R$ 100,00 pendentes, sem último pagamento,
histórico vazio expansível e navegação sem travamento — conforme sua base sintética.
O cenário quitado com meses pagos foi coberto pelo render real do componente no
teste isolado; não foi criada compra ou transferência fictícia na nuvem para isso.
A conta fictícia foi desativada e a senha invalidada. Produção conferida: 795.

Ao publicar, usar o SHA atual acima. A volta continua sendo a 795 sem restauração
de banco/JSON, preservando pagamentos e novas entregas feitos entre as versões.

## Entra no pacote

1. APIs protegidas verificam se a conta ainda está ativa e se seu papel, e-mail,
   cooperativa e vínculo de cooperado continuam iguais aos da sessão. Vínculo
   alterado exige novo login. Permissões atuais substituem permissões antigas.
2. Renovar sessão não recria conta ausente/desativada a partir do cookie.
   Falha ao consultar o cadastro retorna indisponibilidade, sem renovar cookie.
   Produção não desliga autorização por configuração de banco ausente.
3. Login e renovação não afirmam uma segunda etapa de autenticação inexistente.
   MFA continua desligado; este pacote não implanta MFA.
4. Novo evento do Livro Caixa considera números já usados quando o contador está
   atrasado ou foi perdido. Não renumera histórico. Débito e retenção do mesmo
   pagamento continuam agrupados. Contador adiantado é respeitado.
5. Montagem do histórico do Livro Caixa aceita pagamentos antigos sem listas de
   IDs e reconhece fichas associadas pelas notas, sem interromper a tela.
6. Identificação 797 no aplicativo e service worker. Verificadores locais usam
   o mesmo Node 24 do deploy. Controle de destino impede cruzar projetos/bancos.
7. O aviso de snapshot financeiro concluído apenas repinta o cartão do cooperado.
   Antes ele iniciava outro recálculo que emitia o mesmo aviso, causando repetição
   síncrona. Alteração de débito HB continua recalculando, sem realimentar o aviso.
   Não muda a fórmula dos valores nem os dados financeiros.

## Fica fora

- CAS/gravação versionada, checkpoint/rebase e ativação em outras cooperativas.
- Novas migrations/RPCs, limites atômicos, transferências, repasses, cashback,
  alterações de projeções financeiras e novos fluxos de compra/estorno.
- Correção de rascunho após conflito da 796: depende do fluxo versionado e não
  está isoladamente incluída neste pacote. Permanece validada na homologação 796.
- Alterações em contratos, entregas, valores a receber, folha, débitos, créditos,
  pagamentos já feitos ou o repasse Jeferson/Jovane já acertado manualmente.
- Renumeração de entradas históricas do Livro Caixa.

Não haverá migration, importação de planilha, restauração nem limpeza de dados
oficiais na publicação. O protocolo de gravação continua o da produção 795.

## Validação desta seleção

- Checagem de tipos passou.
- `test-release-797.mjs`: 16 suítes isoladas passaram, incluindo a regressão do
  ciclo de eventos, que falhou no código antigo e passou após a correção.
- `run-release-verify.ts --fast`: passou com os contratos originais da 795.
- HTTP real, Next local e banco de homologação: login 200, leitura própria 200,
  leitura e escrita de outra cooperativa 403, desativação e mudança de vínculo
  recusadas 401, inclusive na renovação. Conta descartável removida ao terminar.
- Auditoria de dependências de produção: zero vulnerabilidades reportadas.
- Build Webpack de produção passou; verificação do bundle de persistência passou.
- Homologação READY: `dpl_C2XMRKm9JX42gqHP3peSrg2xa2Dz`, SHA
  `4aaf73336f296ae221e8b080fccdbf7f6732451f`, build 797 confirmado pela API.
- Responsável fictício: painel, Conferir entregas, Em aberto, Pagar cooperados
  e Livro Caixa abriram. Painel e Em aberto mostraram os mesmos R$ 380,00 do
  cenário sintético; livro mostrou os dois pagamentos fictícios anteriores.
  Nenhum novo pagamento foi executado pela interface.
- FALHA ANTERIOR: após login do cooperado fictício, o navegador deixou de responder
  às leituras de tela. Reproduziu em outra origem sem cache prévio. A sessão
  inicial vinha de logout do responsável; o reteste começou direto como cooperado.
  A investigação seguinte reproduziu o ciclo do evento de snapshot no hook do card.
  O resultado desta falha foi substituído pelo reteste concluído abaixo.
- As duas contas fictícias autorizadas foram desativadas e senhas invalidadas
  depois dos testes. Conta de mercado não foi reativada: a revisão automática
  recusou sua inclusão por ausência de autorização específica, e o ensaio foi
  limitado a cooperado/responsável, sem contornar essa decisão.
- O app oficial foi consultado após a publicação de homologação e permaneceu na
  795, SHA `493f584ba708a3496bae11eb994433c05ba198d8`.

Os ensaios HTTP não são prova de capacidade/p95 em produção. A suíte ampliada
antiga de desempenho não foi declarada aprovada. Expansão comercial permanece
uma etapa separada.

## Reteste concluído em 08/11/2026 — aguardando OK

Versão candidata aprovada para o escopo deste pacote: build 797, commit
`41c34a25ffea303c9d35d42e5939641974d5cda5`, deployment
`dpl_3FrbB5eJTwW8JjpRBD8hVaNXzaSA`, estado READY.
URL: https://hbcooperativas-homologacao-v1-9g73zey13-hbcooperativas.vercel.app

O cooperado fictício entrou sem travamento. Início, Financeiro e HB Créditos
exibiram R$ 100,00 de ficha a receber, igual à entrega pendente conferida por leitura
independente na nuvem, sem pagamento nem avulso associado. HB disponível para
compra permaneceu R$ 0,00, sem liberação fictícia de limite. Voltar ao início e
recarregar preservou o valor e a interface respondeu normalmente. Não foi feita
compra/pagamento real ou fictício neste ensaio. O novo commit muda apenas o hook
do cooperado e seu teste em relação ao deployment anterior; as telas do responsável
validadas anteriormente não foram modificadas.

O cooperado fictício foi desativado novamente e a senha temporária invalidada.
Leitura final do app oficial confirmou a 795 e o deployment de retorno abaixo.
A publicação da 797 está aguardando o OK específico do proprietário. Usar o SHA
aprovado acima, sem promover o build que aponta para o banco de homologação.

## Publicação e retorno

Conferência adicional do ciclo de pagamento: a lógica existente foi exercitada
sem alterar código de produção em `test-pagamento-ciclo-historico.ts`. Pagamento
de dois meses zerou o aberto; uma entrega posterior no mesmo mês abriu só seu
novo saldo e permitiu outro pagamento. No mês seguinte o ciclo também reiniciou.
Após reabrir os dados, os três meses, os três pagamentos, seus recibos e entradas
anteriores do Livro Caixa permaneceram. Um PIX com dois meses foi somado uma vez.
As abas mensais já existem no Financeiro do cooperado e em Pagar do responsável.
Nenhum pagamento real foi criado/alterado por esse teste e o SHA aprovado do app
permanece `41c34a25ffea303c9d35d42e5939641974d5cda5`.

1. Testar a seleção como Preview no projeto de homologação, sem dados oficiais.
2. Apresentar URL, SHA, resultados e riscos ao proprietário; aguardar OK específico.
3. Com OK, criar deployment do mesmo SHA no projeto oficial com configuração
   oficial, conferir READY, identidade e login. Não promover o build ligado ao
   banco de homologação para o domínio oficial.
4. Conferir navegação, saldo exibido, Em aberto, Livro Caixa e comprovante sem
   criar compra/pagamento real de teste. Conferir logs de autenticação e API.
5. Se surgir regressão, devolver o tráfego à produção 795:
   `dpl_6rmWu9Rxi1xkmQmiYQEC1VSAdhFr`, SHA `493f584ba708a3496bae11eb994433c05ba198d8`.
   Não restaurar banco ou JSON antigo sobre lançamentos posteriores.

Risco residual: cada API protegida acrescenta uma consulta indexada ao cadastro.
Indisponibilidade do banco bloqueia acesso por segurança. A interface publicada
precisa ser conferida e esse custo observado após a publicação. A volta à 795
retira também a proteção nova de revogação; é contingência, não solução definitiva.
