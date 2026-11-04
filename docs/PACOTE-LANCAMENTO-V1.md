# HB Cooperativas V1 — pacote em validação

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
