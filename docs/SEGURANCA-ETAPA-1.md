# Etapa 1 — candidato isolado de segurança

## Base e limites

- Produção preservada: build 790, commit `31849c64a2009aba2d235babd95a29af284067e5`.
- Implantação estável: `dpl_84sJPvY3WkMykFNx9p9CSwBaED7Y`.
- Referência local de retorno: `hb-v1-estavel-790`.
- Candidato: branch `codex/seguranca-etapa-1`, em worktree separado.
- Nenhuma migration, alteração de dados ou publicação em produção nesta etapa.

## Mudança preparada

Next e eslint-config-next atualizados de 16.2.12 para 16.4.3; Sharp para 0.35.5;
correções compatíveis de dependências transitivas, incluindo DOMPurify 3.4.17.
Ferramenta de testes tsx fixada em 4.23.15 para execução reproduzível.

Auditoria após atualização: nenhuma dependência de execução sinalizada; nenhuma
dependência com severidade crítica ou alta no conjunto completo. Permanecem 16
alertas moderados associados às ferramentas de análise de código e minimatch.
Não foi aplicado `npm audit fix --force` nem downgrade sugerido pelo resolvedor.

## Validação preparada

`npm run test:seguranca-etapa1` executa dez suítes de fixtures: avulsos/cota,
recebíveis, paridade do responsável, fotos e retomada, troca de cooperativa,
pagamentos, segurança HB, recusa segura e regras de imagens. Inclui o bloqueio de preview fora do projeto/banco isolados. O processo filho
não recebe credenciais Supabase, banco, cobrança ou segredos de produção.

O workflow novo abrange a branch candidata e a branch V1 publicada, sem secrets.
Compilação e testes locais não equivalem a homologação visual completa, carga,
restauração de dados ou fluxos reais de navegador com banco separado.

## Impedimentos constatados antes de homologar

1. A configuração local chamada laboratório aponta para o banco de produção.
2. URL e chave de serviço da Vercel são compartilhadas entre preview e produção.
   Publicar a branch no fluxo Git atual pode gerar preview ligado ao banco real.
3. O backup antigo usa paginação insuficiente, oculta hashes de recuperação e lê
   arquivos binários como texto. Não pode ser apresentado como backup integral
   comprovadamente restaurável.
4. Banco remoto PostgreSQL 17.6; cliente pg_dump local 16. A versão local não deve
   ser usada para produzir um dump alegadamente completo desse servidor.

## Próximos critérios obrigatórios

- Provisionar/verificar Supabase exclusivo de homologação, com credenciais próprias
  e dados fictícios. Não copiar contas, senhas, PINs ou saldos de pessoas reais.
- Separar a implantação de homologação e conferir ausência de credenciais do banco
  real antes de publicar o candidato ou disparar os previews automáticos atuais.
- Preparar backup consistente com ferramenta compatível, cópia binária de mídias,
  paginação, integridade e armazenamento protegido; comprovar restauração separada.
- Homologar login, preços, conferência, PDF, pagamentos e HB com perfis de teste.
- Só depois integrar o candidato à linha de produção, incrementar o build e
  publicar. Conferir versão e saúde, preservando o deployment estável para retorno.

O Supabase separado existente foi confirmado: `hbcooperativas-homolog` (`ocyfzramxvxqbtkorubn`), com 18 tabelas públicas e estrutura mais antiga que a produção. A tabela `hb_credit_fiscal_notes` está sem RLS; não foi alterada automaticamente. A URL de orientação é https://supabase.com/docs/guides/database/postgres/row-level-security .

Foi criado o projeto Vercel exclusivo `hbcooperativas-homologacao-v1` (`prj_1dqke8xRjtzsCouFEczEB4ZgmF10`), Node 24, sem credenciais herdadas. A primeira tentativa em Node 20 foi recusada pela Vercel por descontinuação; a candidata passa a exigir Node 24 e o CI foi alinhado. URL e chave pública do banco separado e segredo de sessão exclusivo foram configurados. Falta o usuário cadastrar a chave secreta de servidor desse projeto pela tela da Vercel; não solicitar valores no chat.

O ignoreCommand impede a branch candidata de criar preview no projeto que compartilha o banco real. Uma cópia ZIP do código estável e checksum foi guardada em backups locais. Isso não é backup dos dados.

## Verificação de implantação — 02/11/2026

- O usuário cadastrou `SUPABASE_SERVICE_ROLE_KEY`; metadados da Vercel confirmam
  segredo separado nos ambientes Preview e Production somente do projeto de testes.
  O conteúdo da chave não foi consultado nem validado por esse exame de metadados.
- Candidato `a0fe21e231f62ed695d060b18f83580f11906190` publicado como Preview,
  deployment `dpl_HUB1oaCspVBn38tdSzmsbQVASDAW`, estado READY.
- Consulta autenticada pelo plugin Vercel a `/api/client-release`: HTTP 200,
  SHA e deployment correspondem ao candidato. A versão base permanece 790.
- `/api/credit/status`: HTTP 200; módulo e flags habilitados. Esse endpoint
  não comprova conexão ao banco, funcionamento do login ou execução financeira.
- Não foi publicada mudança no projeto oficial nesta verificação.
- A pendência anterior de cadastro da chave foi resolvida; permanecem a validação
  funcional da conexão, diferenças de schema, permissões e restauração.

Ainda não há restauração integral comprovada nem homologação financeira completa.
Não declarar a etapa concluída ou atualizar a produção enquanto esses critérios
continuarem pendentes.

## Continuação — proteção do banco e indicação de conexão

- Consulta de `/api/auth/schema-status` no preview confirmou leitura de `app_users`
  pelo servidor; isso não substitui homologação de login por perfil.
- Migração `20261102162441_hb_credit_fiscal_notes_server_only.sql` aplicada somente
  em `ocyfzramxvxqbtkorubn`: RLS ativa, nenhum privilégio direto para anon ou
  authenticated, acesso de service_role preservado. Consulta posterior confirmou
  os três resultados. O advisor deixou de apontar RLS desabilitada.
- A ausência de políticas nessa tabela é deliberada: nenhum usuário acessa a tabela
  pela Data API; a API própria autoriza o acesso no servidor. Permanecem avisos de
  search_path em 13 funções, que exigem revisão das rotinas antes de alteração.
- A rota de diagnóstico deixa de responder autenticação pronta quando o banco
  retorna erro de permissão ou chave inválida; responde indisponível sem divulgar
  o detalhe interno. Também trata exceção do cliente.
- Nova suíte executa a rota com o cliente Supabase e transporte simulado. As 11
  suítes isoladas passaram, assim como a compilação Next 16.4.3 em Node 24.
- Migração `20261102162805_hb_v1_schema_compatibility.sql` preparada a partir das
  estruturas existentes no repositório, com acesso das tabelas novas restrito ao
  servidor. Não recria rotinas financeiras antigas nem copia usuários ou saldos.
  Aplicação inicialmente pendente por expiração da confirmação do conector.
  Após o usuário solicitar o reenvio, aplicada com sucesso em 02/11/2026 somente
  em `ocyfzramxvxqbtkorubn`. Consulta posterior confirmou as dez tabelas, RLS
  ativa, acesso direto negado a anon/authenticated e acesso do servidor preservado.
  Advisor posterior não apresentou erros; permanecem 13 avisos de search_path
  e informações de RLS sem políticas nas tabelas deliberadamente exclusivas do servidor.
- A homologação financeira permanece pendente de compatibilidade estrutural,
  rotinas revisadas, dados fictícios e testes completos. Produção permanece 790.

## Validação de rotinas financeiras — 02/11/2026

- Consulta consolidada `hb_credit_market_receivable_snapshot` instalada na
  homologação a partir da migração já versionada de 01/11.
- `supabase/tests/market_receivable_snapshot.sql` passou no banco com execução
  como service_role: 27 registros no mercado principal, dois mercados adicionais,
  meses distintos, valores bruto e líquido diferentes, lançamentos pagos,
  transações estornadas e tentativa de leitura de outra cooperativa.
  O total não depende da lista de 20 itens; inconsistência sem recebível é
  sinalizada; execução anônima é recusada. Todas as fixtures foram revertidas.
- Migração `20261102175313_hb_v1_rpc_server_only.sql` aplicada só em homologação.
  Treze rotinas previamente revisadas tiveram search_path fixado e execução
  direta retirada de PUBLIC/anon/authenticated, preservando service_role.
  Advisor posterior: nenhum ERROR ou WARN; nove INFO de RLS sem políticas,
  intencionais em tabelas exclusivas do servidor com privilégios públicos revogados.
  Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Teste adicional reproduziu pagamento permitido para conta `suspended`.
  Corrigido na homologação pela migração `20261102175603_hb_credit_authorize_active_account.sql`,
  preservando o corpo atual de validação de snapshot e exigindo status `active`.
- A coexistência da assinatura antiga e da atual com argumento opcional causou
  ambiguidade na chamada com nove parâmetros, detectada pelo teste.
  A migração `20261102175724_hb_credit_remove_legacy_authorize_overload.sql`
  remove somente a assinatura antiga, sem CASCADE. A atual aceita nove ou dez
  parâmetros e mantém a mesma validação de segurança em ambos os casos.
- `supabase/tests/hb_payment_server_access.sql` passou: débito único, recebível
  líquido, distribuição 60/30/10 do desconto, cooperativa/nonce incorretos
  recusados, conta suspensa recusada nas duas formas de chamada, ausência de
  snapshot recusada também na chamada compatível, repetição sem débito duplo e
  rotinas HB sem execução pública. Nenhuma integração financeira externa chamada.
- Consulta após os testes confirmou zero contas, mercados e transações de fixture
  persistidos. Nenhuma mudança desta entrega foi aplicada ao banco oficial.
- Ainda pendentes: cinco rotinas chamadas pela V1 ausentes nesse banco antigo
  (transferência, conversão de cashback, confirmação de repasse, liquidação do
  desconto e conversão de cashback em crédito), revisão de estornos, validação de
  login/abas por perfil, armazenamento, concorrência e restauração integral.

## Estornos — validação de composição

- O teste `supabase/tests/hb_refund_balances.sql` reproduziu falha na rotina antiga:
  compra de 1.000 centavos com 200 de cashback debitou 800 de crédito, mas o estorno
  devolveu 1.000. Um uso anterior de 1.000 caiu incorretamente para 800.
- Migração `20261102180145_hb_credit_refund_consistent_balances.sql` aplicada
  somente no banco de homologação. Restaura o crédito efetivamente debitado,
  devolve o cashback aplicado, reverte o cashback concedido e identifica como
  revertidas as parcelas de desconto ainda não liquidadas.
- O estorno bloqueia a venda e a conta antes de verificar repetição. Repetição
  confirma a operação anterior sem gerar novo crédito; falha de gravação propaga
  erro e reverte a operação inteira. Nenhum erro é convertido em sucesso parcial.
- Caso a composição seja incompatível com o saldo atual ou o cashback necessário
  já tenha sido consumido, retorna erro de conferência antes de alterar saldos.
  Não há perdão silencioso de diferença nem saldo truncado para zero.
- Teste passou: compra mista, compra sem cashback aplicado, estorno isolado de
  venda concluída integralmente com cashback, separação por cooperativa,
  recebível do mercado, repetição, colisão de identificador ao fim da gravação
  (rollback de todos os efeitos) e cashback indisponível (recusa sem alterações).
  Pagamento e consulta de recebíveis também passaram novamente após a mudança.
- O cenário integralmente com cashback testa o estorno de um estado concluído;
  não comprova ainda a autorização de uma compra integralmente com cashback.
- Advisor: zero ERROR/WARN, permanecendo as mesmas nove INFO de tabelas de uso
  exclusivo do servidor. Não houve alteração de produção ou integração externa.
- Pendentes para esta área: concorrência em conexões distintas, fluxo de aprovação
  pela interface, tratamento contábil de estorno após liquidação/fechamento e
  alinhamento da apresentação de todos os componentes no extrato. As cinco
  rotinas ainda ausentes continuam pendentes de revisão própria.
