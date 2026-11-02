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

## Liquidação de descontos e repasse — homologação

- Duas das cinco rotinas ausentes foram implementadas e aplicadas somente em
  homologação: `hb_credit_liquidate_discount_pool` e `hb_credit_confirm_app_repasse`.
  Migrações `20261102180929_hb_credit_discount_settlement_scope.sql` e
  `20261102181338_hb_credit_discount_require_settled_receivables.sql`.
- A rotina antiga de descontos abrangia todos os mercados da cooperativa no mês.
  A nova usa somente vendas do mercado vinculadas à liquidação, com transação
  válida, recebível SETTLED e liquidação CONFIRMED. Recebíveis incompletos não
  geram sucesso falso. Chamadas repetidas não duplicam a trilha de liquidação.
- Repasse usa bloqueio por cooperativa/mês e bloqueia as linhas exatas da composição.
  Registra somente essas linhas e gera uma origem estável para o Livro Caixa.
  A repetição retorna o repasse anterior; novos descontos posteriores exigem
  conferência do fechamento e não são marcados como quitados pelo repasse antigo.
- `supabase/tests/hb_discount_settlement_scope.sql` passou: três mercados, duas
  cooperativas, liquidação pendente recusada, recebível incompleto recusado,
  isolamento, soma correta, repetição, colisão de identificador com rollback,
  origem estável e desconto posterior preservado como pendência.
- Aplicativo candidato passa a chamar a liquidação dos descontos após confirmar
  o pagamento e os recebíveis. Erro da rotina deixa de ser ignorado. Repetição da
  confirmação tenta reparar somente os descontos, sem repetir a baixa do crédito.
- Prévia distingue repasse anterior de novos descontos; tela mostra “A conferir”
  quando necessário. Falhas de consulta não são convertidas em indicação de pago.
  Contagem usa count exact; totalização anterior à primeira confirmação ainda
  precisa migrar para uma leitura agregada única para superar o limite de linhas.
- Duas suítes novas simulam erros de servidor e descontos após o fechamento.
  As 13 suítes locais passaram, sem credenciais de produção. Teste SQL reverteu
  as fixtures; consulta posterior confirmou zero alocações de fixture persistidas.
- Restam três rotinas ausentes: transferência entre cooperados e duas conversões
  de cashback. Ainda pendentes a homologação visual, concorrência em conexões
  distintas, sincronização completa com Livro Caixa, recuperação de todas as
  etapas de liquidação e restauração integral. Não liberar produção nesta fase.

## Cashback para A receber — registro durável

- Revisão confirmou duas gravações separadas no fluxo antigo: baixa do cashback
  no RPC e criação do avulso no aparelho/operacional.json. Além disso, o RPC antigo
  tentava inserir ledger sem transaction_id, enquanto a coluna é NOT NULL na
  homologação. Não foi copiado sem revisão.
- `20261102184911_hb_credit_cashback_receivable_durable.sql` aplicada só na
  homologação: baixa, transação ADJUSTMENT, ledger e auditoria gravados juntos.
  O crédito não depende mais de a segunda gravação do aparelho ser concluída.
  Nenhum limite ou dívida HB é alterado pela conversão para A receber.
- Chave de repetição fica restrita à cooperativa, ao cooperado e ao mês. Repetição
  retorna a conversão anterior antes de consultar saldo novo; reaproveitamento do
  identificador por outro cooperado/mês é recusado. Mês 13 também é recusado.
- Leitura `hb_credit_cashback_receivables_snapshot` é agregada, sem limite de
  página, e restrita ao servidor. A cópia operacional reconstrói esses avulsos
  pela origem financeira em leituras e gravações, sem duplicação.
- Ativação restrita: automática quando HB_HOMOLOGATION_ONLY=true; fora da
  homologação exige HB_CASHBACK_LEDGER_PROJECTION=true e instalação prévia das
  duas rotinas. Não habilitado nem aplicado no banco de produção.
- Projeção preserva o estado pago conhecido na cópia do servidor ao receber
  cópia antiga do aparelho. Não presume que um pagamento do mesmo mês quitou
  este crédito específico. A preservação não substitui a futura identificação
  canônica dos avulsos efetivamente incluídos em cada pagamento.
- Operacional indisponível com créditos existentes gera falha explícita; não
  cria um arquivo vazio que poderia sobrescrever outros lançamentos. Erros de
  leitura do ledger também não são tratados como saldo zero.
- `supabase/tests/hb_cashback_receivable_durable.sql` passou: baixa/destino,
  dívida preservada, recuperação, repetição sem consumir cashback novo,
  cooperado/mês/cooperativa e nova conversão posterior. Fixtures revertidas.
- `test-hb-cashback-receivable-projection.ts` passou: reconstrução sem cópia
  local, dedupe, pago anterior preservado, não presumir quitação por competência,
  falha de consulta e recusa de origem inconsistente. As 14 suítes locais passaram.
- Permanecem duas rotinas ausentes: transferência entre cooperados e sweep de
  cashback para crédito. As versões antigas aumentam o limite liberado sem
  modelar separadamente o crédito próprio recebido, podendo divergir do snapshot
  de lastro em entregas. Exigem solução própria antes de serem instaladas.
- Pendentes: fluxo visual por perfil, perda de resposta/rede em aparelho real,
  pagamento/cancelamento dos créditos derivados, identificação canônica da
  quitação e validação da leitura agregada da taxa HB antes do primeiro repasse.

## Saldo próprio — base de transferência e conversão

- Migração `20261102192056_hb_credit_owned_balance_transfers.sql` aplicada só
  na homologação. `own_balance_cents` guarda recursos próprios separadamente de
  limite liberado, teto baseado nas entregas e dívida. Nenhum backfill de fundos
  foi inferido ou executado em contas existentes.
- Transferência trava intenção e contas em ordem fixa, valida cooperativa,
  pagador, destinatário, nonce, status e validade. Usa saldo próprio primeiro;
  qualquer parcela de crédito exige snapshot válido, estado SYNCED e saldo.
  Recebedor ganha saldo próprio, sem aumento do limite de entregas.
- Transações e ledger dos dois lados, composição do débito, confirmação e
  auditoria são gravados juntos. Repetição conserva comprovante e valores;
  outro pagador não recebe confirmação da transferência anterior.
- Sweep converte cashback em saldo próprio sem alterar limite ou dívida. Chave
  por conta/mês impede repetição e preserva cashback novo após a conversão.
- `supabase/tests/hb_owned_balance_transfers.sql` passou: recursos próprios e
  crédito combinados, devolução só com saldo próprio, conservação, destinatário
  suspenso, conta fora da cooperativa, snapshot STALE, nonce, repetição, colisão
  tardia de identificador com rollback e conversão sem inflar limites.
- Leitura da conta expõe saldo próprio em campo separado. Reconciliação passa a
  incluir somente a parcela de crédito das transferências, excluindo recursos
  próprios, entrada do recebedor e ajustes/conversões de cashback. A ficha cobra
  a parcela credit_debited_cents, com fallback histórico para transferências antigas.
- Corrigido também o corte de quitação: a janela não quita operações posteriores
  ao pagamento; assinatura ou edição tardia não amplia a data de corte. Data
  inválida não é substituída por “agora”. IDs explicitamente quitados mantêm prioridade.
- Consulta agregada somente leitura na produção em 02/11/2026 encontrou zero
  transferências confirmadas e zero CASHBACK_SWEEP. Essa verificação precisa ser
  repetida antes do corte para produção; não prova ausência futura de legado.
- As duas rotinas agora existem no catálogo da homologação, mas **não estão
  liberadas para uso no aplicativo**. `isHbOwnedBalanceOperationsReady()` permanece
  false: criação/autorização de transferência e sweep são recusados antes de
  acessar o banco. Não mudar a trava até concluir compras, estornos e interface.
- Quinze suítes locais e os seis testes SQL passaram; compilação Next/TypeScript
  passou em Node 24. Fixtures SQL revertidas. Nenhum movimento financeiro real
  ou alteração do banco de produção nesta entrega.
- Pendentes antes de liberar: consumo e devolução de saldo próprio no mercado,
  saldo total e composição nas telas/caches, reconciliação e reset via API,
  testes de concorrência real e latência do sweep, scripts antigos de reparo de
  schema, cancelamentos e Livro Caixa. A existência das rotinas não conclui a etapa.

### Compras e estornos com saldo próprio — 02/11/2026

- Aplicada somente na homologação a migration `20261102195821_hb_credit_owned_purchase_refund.sql`.
  Compra usa cashback solicitado, depois saldo próprio e finalmente crédito. A
  composição fica na transação; débito de empréstimo registra apenas sua parcela.
  Conta ativa continua obrigatória; snapshot de crédito só é exigido quando há
  empréstimo. Pagamento integral próprio/cashback não cria movimento de valor zero.
- Estorno restaura cada origem separadamente, registra retorno próprio no extrato
  e preserva dívida de outras operações. Os bloqueios e rollback permanecem.
- Tela da conta e cartão inicial somam recursos próprios ao disponível para pagar;
  conta detalha saldo próprio e crédito. Pagamento simula a composição e usa o
  débito informado pelo servidor no cache; repetição não soma dívida novamente.
  Revisão entre aparelhos inclui saldo próprio e cache não descarta conta que só
  tenha esse recurso. Extrato diferencia uso e estorno de saldo próprio.
- Sete testes SQL passaram, incluindo compra mista, integral própria e integral
  cashback, estorno, repetição, erro parcial e isolamento. Dados fictícios revertidos.
  Quinze suítes locais passaram após os ajustes finais de cache/cartão, assim
  como compilação Next/TypeScript em Node 24 e verificação do pacote de persistência.
  Consulta final confirmou zero contas/transações fictícias remanescentes.
- Trava continua false: ainda faltam fechamento da integração de transferências,
  reset/reconciliação, frescor de snapshots do QR, idempotência concorrente da
  compra, reparos antigos, Livro Caixa e validação autenticada por perfil. Esta
  etapa não libera uso na produção nem conclui o plano completo.
