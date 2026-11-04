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

### Identidade e recuperação de compras — 02/11/2026

- Reproduzido no banco de testes: a mesma chave podia retornar sucesso para
  outro cooperado antes de validar cobrança/nonce. O teste novo falhou na versão
  anterior com “Chave de outra pessoa aceita como compra confirmada”.
- Aplicadas somente na homologação `20261102220126_hb_credit_payment_retry_identity.sql`
  e `20261102220606_hb_credit_payment_reserved_owner.sql`. A rotina serializa por
  chave e cobrança, valida cooperativa/nonce/vínculo reservado e limita repetição
  ao mesmo cooperado, cobrança e pagamento ainda lançado. Estorno não volta como
  compra confirmada. Chave vazia/reutilizada é recusada.
- O serviço mantém verificação do PIN, mas deixa a validação financeira final
  com a RPC, evitando que uma prévia exija pagar novamente uma compra concluída.
  Cashback solicitado é limitado pelo banco ao saldo real e ao valor da compra.
  Comprovante repetido vem do resultado original; fallback consulta também CNPJ
  e cooperado, sem inventar código quando a consulta falha. Disponível zero é válido.
- A projeção imediata na ficha passa a usar o crédito efetivamente debitado
  retornado pelo servidor, incluindo zero, em vez da estimativa anterior ao pagamento.
- Teste local usa SDK real com transporte simulado e hash/PIN de teste: recuperação,
  PIN errado/bloqueado, rejeição do banco, comprovante ausente e saldo zero.
- Oito suítes SQL passaram com a rotina atual. Tentativa adicional em conexões
  distintas testou mesma chave, chaves diferentes no mesmo QR e dois QRs com
  saldo para somente uma compra; em cada caso ocorreu apenas um débito. Porém os
  horários comprovaram que o conector serializou as chamadas, sem sobreposição.
  **Concorrência real permanece pendente**; não contar esse ensaio como teste
  simultâneo. Os registros persistidos desse ensaio foram removidos por seu
  identificador exclusivo; consulta final retornou zero contas/transações fictícias.
- Trava de transferências permanece false. A etapa não muda a produção e não
  conclui revisão contábil, restauração ou testes autenticados por perfil.
- Validação final desta etapa: 16 suítes locais, oito suítes SQL e compilação
  Next/TypeScript em Node 24 aprovadas; pacote de persistência conferido. Auditor
  do banco sem ERROR/WARN, mantendo apenas avisos informativos já conhecidos.

### Repasses completos e Livro Caixa permanente — 02/11/2026

- `20261102222652_hb_credit_app_repasse_snapshot.sql` aplicada somente na homologação:
  soma/contagem no banco sem corte de mil registros; composição exige liquidação
  confirmada, recebível liquidado, pagamento lançado e mesmo mês/cooperado/cooperativa.
  Inconsistência impede tanto o resumo quanto a confirmação. Parcela paga não
  volta a Em aberto; desconto posterior exige conferência do fechamento.
- Serviço de confirmação também confere o ciclo. A conferência usa todos os
  participantes financeiros do mês, independentemente de cadastro paginado ou
  login ativo, e isola pagamentos por cooperativa. Arquivo/cadastro indisponível
  não vira quitação. Removidas leituras individuais do cadastro dessa prévia.
- `20261102223147_hb_credit_operational_book_snapshot.sql` aplicada somente na
  homologação: cashback e repasses confirmados são lidos em uma única consulta.
  Pull/push do operacional reconstrói a linha do repasse a partir do banco, com
  origem única, valor canônico e data brasileira. Mantém sequência já registrada,
  deduplica aparelhos e restaura linha automática indevidamente excluída.
- Ativo automaticamente só na homologação; habilitação futura na produção exige
  migrations e `HB_FINANCIAL_LEDGER_PROJECTION=true` (ou a flag anterior de cashback).
  Não cobre ainda toda a contabilidade: lançamentos manuais/PIX/Asaas, estornos de
  períodos liquidados, encerramento anual e concorrência do operacional continuam
  sujeitos às demais verificações do plano.
- Testes novos: 1501 parcelas (valor confirmado igual ao resumo), 1501 participantes
  (último não pago detectado), mês anterior, isolamento, permanência do caixa,
  deduplicação, sequência, upload atrasado e falha de consulta sem publicar vazio.
- Dezoito suítes locais, dez suítes SQL e compilação Next/TypeScript em Node 24
  aprovadas; a compilação foi repetida após o tratamento de arquivo ausente.
- Consulta ao painel de backups por Computer Use interrompida pelo próprio
  controle de segurança: URL do navegador Windows não pôde ser confirmada.
  Nenhuma restauração foi executada. Backup completo/restauração real permanece
  requisito pendente, não substituído por exportação parcial do script antigo.
- Instrução vigente do usuário: seguir todas as etapas sem novos pedidos de
  continuação, publicar os blocos validados na homologação e apresentar evidências
  e riscos ao fim. **Qualquer publicação no aplicativo oficial aguarda OK explícito.**

### Cópias de segurança e concorrência real — 02/11/2026 (Fortaleza)

- Painel acessado com sucesso no navegador integrado. Backups físicos diários
  confirmados, incluindo 02/11/2026 10:21:38 UTC; PITR não está ativado. O painel
  confirma que esses backups não incluem os objetos do Storage.
- Usuário autorizou projeto temporário de restauração e sua exclusão, com custo
  informado de US$ 9,68/mês. Nome preparado: `hbcooperativas-restore-check-20261102`.
  A tela exigiu senha nova, etapa entregue ao usuário conforme política do navegador.
  Usuário informou início, mas o projeto não apareceu na lista nem no seletor,
  mesmo após atualização. Não afirmar que a restauração ocorreu; não criar cópias
  adicionais ou apagar projetos existentes para contornar essa incerteza.
- Criado exportador de Storage separado: inventário paginado até página vazia,
  leitura em quatro lotes, binários sem conversão UTF-8, tamanho e SHA-256, AES-256-GCM
  autenticado por objeto, inventário antes/depois e verificação de todos os bytes.
  Requisições têm timeout. Falha ou mudança durante a cópia não gera sucesso.
- Cópia real concluída: 1512 arquivos, 84820003 bytes, cinco buckets. Verificada
  em outro processo, inclusive recuperação da chave protegida pelo DPAPI. Preservada
  fora do worktree em `backups/ifptyzikekrswippzmsf/storage-2026-11-03T00-09-57-997Z-6b185c04`
  na raiz do projeto. Conteúdo e manifesto cifrados; nenhum segredo foi impresso.
  Chave recuperável somente por este usuário Windows nesta máquina. Não é backup
  portátil nem comprovação de restauração em outro servidor; essa limitação permanece.
- `backup:cloud` legado agora recusa uso como backup restaurável por padrão.
  Exportação diagnóstica exige `--diagnostic-export` e marca `complete:false`.
  Não depende dele a recuperação do banco. Novos comandos são `backup:storage:encrypted`
  e `backup:storage:verify`, sempre com destino explícito e sem alterar a nuvem.
- Dezenove suítes locais aprovadas, incluindo 1101 imagens com paginação reduzida
  pelo servidor, adulteração, chave errada, inventário alterado e falha de download.
- Concorrência real comprovada com duas abas do SQL Editor da homologação,
  conexões diferentes e intervalo sobreposto de aproximadamente 15 segundos:
  mesma chave retornou transação original; chaves diferentes no mesmo QR recusaram
  a segunda cobrança; QRs distintos na mesma conta não excederam o disponível.
  Primeiro par: backends 4173810/4173811, inícios 00:22:44.983/00:22:45.131 UTC,
  fim 00:23:00.081/00:23:00.102 UTC em 03/11. Segundo: 4173841/4173842,
  00:24:22.957/00:24:23.042 até 00:24:37.972/00:24:37.974. Terceiro:
  4173861/4173862, 00:25:26.459/00:25:26.835 até 00:25:41.479/00:25:41.483.
- Fixture persistida para esse ensaio: prefixo `hb_fixture_browser_concurrency_1793665286675`,
  CNPJ reservado `99999999999999`. Limpeza via conector expirou duas vezes na
  confirmação. **Ainda precisa remover somente essa fixture e verificar zero
  remanescente**; não declarar limpeza concluída. Não repetir testes que reservam
  esse mesmo CNPJ antes disso.
- Achado para a próxima revisão de acesso: `authRoutes.ts` emite `mfaVerified:true`
  sem desafio, enquanto `/api/auth/mfa` está inativa. Avaliar/fixar o contrato do
  modo `HB_STAFF_MFA_REQUIRED` antes de qualquer alegação de proteção por MFA.
- Permanecem: restauração física real e cleanup do temporário, cópia portátil,
  perfis autenticados/abas/celular, estornos e encerramento contábil, concorrência
  de limites e sincronização, integração final de saldo próprio e reparos antigos.
- Em seguida, a navegação do Supabase no IAB passou a falhar com
  `ERR_NAME_NOT_RESOLVED`. Uma tentativa pelo endereço HTTPS oficial também
  falhou; não houve alteração de DNS/firewall nem tentativa de contornar a política.

### Informação de MFA na sessão — 02/11/2026 (Fortaleza)

- Teste com JWT assinado real e usuário fictício reproduziu `mfaVerified:true`
  sem desafio de autenticação. Corrigido para false no emissor comum de sessões.
  Nenhuma exigência de MFA foi ativada, desativada ou contornada; a feature já
  permanecia desligada em `staffAccessPolicy.ts` e a rota continua indisponível.
- Seis perfis verificam emissão de sessão, papel preservado e cookie HttpOnly;
  isso não substitui teste autenticado da interface de todas as abas.
- Vinte suítes locais, compilação Next/TypeScript e conferência do pacote de
  persistência aprovadas para este candidato.
  MFA efetivo permanece fora da proteção disponível e deve constar no parecer.

### Retomada e escopo financeiro — 03/11/2026 (Fortaleza)

- Produção oficial avançou isoladamente para 791, commit
  `a1f0557db1fc7b5ef0507685b0261d8cb3d8fbbd`, na branch
  `codex/hb-comprovante-producao`, deployment `dpl_GtG6wKeukv3F8h99BjtNvFK89W3G`.
  Apenas confirmação/comprovante/compartilhamento da compra foram autorizados.
  Não promover o candidato completo sem o OK final do usuário.
- Limpeza do ensaio `hb_fixture_browser_concurrency_1793665286675` concluída
  somente na homologação: transação com verificação de escopo removeu três contas,
  três compras, quatro cobranças e parceiro fictício, mais seus recebíveis,
  lançamentos e chaves de repetição. Consulta posterior retornou zero nessas
  sete coleções. Três registros de auditoria foram preservados intencionalmente.
- Testes locais passaram para saldo próprio/trava, ciclo de repasses com 1501
  participantes, permanência do Livro Caixa após atualização, pagamentos PIX,
  composição completa do pagamento e exportação contábil. Isso não substitui
  aceite autenticado no celular ou restauração real.
- Reproduzido erro no montador servidor da leitura do cooperado: CNPJ era usado
  como `cooperativaId` na junção do operacional. Pagamentos eram associados ao
  CNPJ em vez do UUID do cadastro, podendo ficar fora do resumo financeiro.
  Corrigido o chamador para usar `coop.id` e passar os cadastros da nuvem.
  Teste executa o montador com transporte fictício e a junção real: falhou antes,
  passou depois para início e leitura completa, preservando pagamento e débito
  já acertado. Nenhum dado financeiro foi regravado por essa correção.
- Backup físico de 03/11/2026 10:18:18 UTC confirmado no painel. Fluxo
  "Restore to new project" preparado com nome autorizado e mesmo custo de
  US$ 9,68/mês. Usuário informou início, mas o projeto temporário ainda não
  apareceu no painel nem no conector. Não há ID novo confirmado; não declarar
  restauração concluída nem criar cópias extras para contornar essa incerteza.
  Nenhuma restauração sobre o banco oficial foi solicitada.

### Reparos legados e restauração adiada — 03/11/2026 (Fortaleza)

- Usuário decidiu adiar o teste físico de restauração. A janela final de criação
  foi cancelada, sem submissão pelo agente. O ensaio segue pendente para o parecer
  de recuperação; isso não interrompe as demais etapas da homologação.
- A correção de escopo financeiro foi publicada na homologação no commit
  `5435aaff0380904582c4931e95a0639809b40708`, deployment
  `dpl_7k3okBLT2AqwBWweBrcRbcUxmTve`, READY e identidade HTTP conferida.
- Aposentados quatro caminhos legados que podiam reaplicar SQL antigo de
  transferência, estorno, aprovação de estorno e cadastro de parceiros com fallback
  para schema financeiro completo. Helpers recusam antes de ler credenciais ou
  abrir conexão; os quatro POSTs administrativos mantêm 401 sem autorização e
  devolvem 410 quando autorizados. GETs de diagnóstico permanecem disponíveis.
- Cadastro de parceiros já configurado continua aceito. Cadastro incompleto
  exige migrations atuais revisadas, sem tentativa de alterar schema durante o
  uso do app. A mensagem de erro de estorno também deixou de recomendar a
  migration antiga que substitui regras novas.
- Regressão com transporte simulado verificou que a implementação anterior
  tentava abrir conexão. Após a mudança, zero conexões para os quatro helpers,
  POSTs sem acesso a banco e cadastro de parceiro configurado aceito.
- Nenhuma migration, configuração ou dado real foi alterado por essa retirada.
  A publicação completa oficial permanece dependente do OK final do usuário.

### Avulsos em entregas complementares — 03/11/2026 (Fortaleza)

- Reproduzido com dados fictícios: após PIX confirmado, entrega complementar de
  R$ 300 ignorava débito de R$ 50 e crédito de R$ 20, exibindo R$ 300 em vez de
  R$ 270. Resumo complementar agora usa a mesma montagem de linhas avulsas da
  ficha normal, sem cobrar outra mensalidade ou recalcular toda a ficha.
- Referência explícita do avulso em um PIX confirmado ou aguardando confirmação
  exclui esse lançamento dos pendentes, mesmo se um aparelho mantiver status
  antigo. A leitura não marca dados pagos nem altera valores gravados. Sem
  referência explícita, não se deduz quitação por nome, data ou valor parecido.
- Seletores e totais compartilham essa regra. O vínculo dos avulsos agora exige
  a cooperativa correta; pagamento de outra cooperativa não quita lançamento local.
- Regressões: cooperado e responsável em R$ 270; débitos/créditos uma única vez;
  débito já acertado preservado; referência em PIX anterior não cobrada novamente;
  PIX aguardando assinatura; totais separados; ausência de alteração dos dados;
  avulso do mês atual no último mês com entrega em aberto; isolamento entre
  cooperativas. Passaram também testes existentes de avulsos/cota e paridade
  Em aberto/Pagar e dos totais do responsável.
- Não cobre ainda aceite autenticado de todas as telas nem os demais cenários
  contábeis do plano. Nenhuma alteração de dados/migration na produção.

### Limite sem sobrescrever compra/bloqueio — 03/11/2026 (Fortaleza)

- Reproduzido no serviço com transporte simulado: entre ler a conta e gravar o
  limite, uma compra elevava o usado de 200 para 700 centavos e a conta era
  bloqueada. A gravação reenviava usado=200 e status=active, desfazendo ambos.
- Escrita manual e sync autoritativo agora enviam somente campos de limite e
  seus metadados. Usado, status, PIN e saldo próprio não fazem parte do payload,
  inclusive no fallback legado. `defaultToNull:false` mantém defaults na criação.
  Erro na leitura prévia recusa a gravação em vez de presumir uma conta inexistente.
- Teste cobre escrita manual/sync, fallback, compra e bloqueio intercalados,
  criação e falha de leitura. Teste SQL na homologação confirmou conservação na
  gravação parcial e defaults de conta nova; ROLLBACK e contagem final zero.
- Passaram também autoridade de limite (seis cenários/visibilidade), base zero
  (cinco cenários) e o modelo de recusa de estado STALE. Dois imports desse modelo
  estavam quebrados após o arquivamento e foram corrigidos. Os casos SKIP de
  estorno STALE e recuperação via cron continuam SKIP; modelo serial não é
  evidência adicional de concorrência real.
- Isso não resolve ainda a atomicidade do teto global/lote coletivo: prévia,
  teto, limites individuais e percentual coletivo ainda usam chamadas separadas.
  A futura transação deve cobrir o lote inteiro, sem confirmação parcial, e ser
  validada com sobreposição real. Sincronização JSON concorrente também permanece
  uma etapa separada. Não declarar concluída a proteção global por esta correção.

### Aprovação de limites em uma transação — 03/11/2026 (Fortaleza)

- Migration criada pela CLI e registrada na homologação como
  `20261103201749_hb_credit_atomic_limit_batch.sql` (arquivo alinhado à versão
  devolvida pelo histórico do banco). RPC invoker, sem execução para PUBLIC,
  anon ou authenticated; somente service_role. Nenhuma migration em produção.
- As quatro ações HTTP do responsável (salvar percentual/teto, alterar teto,
  limite individual e lote) passam por uma RPC. O servidor busca a base de toda
  a cooperativa na nuvem, deduplica titular antigo/atual e não substitui zero por
  valores enviados pelo cliente. Outros cadastros da seleção são recusados.
- A RPC serializa comandos da mesma cooperativa, bloqueia contas em ordem fixa,
  relê o usado atual, valida o lote inteiro e grava teto, percentual, limites,
  snapshots, estado/versão e auditoria na mesma transação. Preserva PIN, usado,
  saldo próprio e bloqueio. Não retorna hash do PIN. Alterar só o teto/valor fixo
  preserva o percentual coletivo existente.
- Testes SQL: aprovação, individual, lote fixo, teto isolado, seleção repetida,
  uso maior que limite, conta suspensa, soma de 1501 contas fora da seleção,
  falha tardia na auditoria com reversão de teto e contas, permissões da RPC.
  Ensaio revertido e zero contas/teto/auditoria/trigger fictícios remanescentes.
- Concorrência real no SQL Editor: conexões 66497/66498, inícios
  20:22:20.493094/20:22:20.514234 UTC e fins
  20:22:23.503631/20:22:23.507775 UTC. A primeira gravação fictícia de 700
  centavos passou; a segunda aguardou e foi recusada com total de 1400 para teto
  700. Duas contas e teto fictícios removidos com conferência; dois eventos de
  auditoria preservados. Não houve movimento de dinheiro ou compra real.
- Testes de serviço/API cobrem uma RPC por comando, cooperativa inteira, alias
  sem duplicação, zero real, falha de nuvem/transporte e barreiras de perfil/CNPJ.
  Em falha de transporte, a mensagem orienta conferir o resultado; não afirma
  falsamente que a operação não ocorreu. Nenhum fallback para reparos legados.
- Corrigida diferença de centavo entre JS e SQL: 70% de 45 centavos era 31 por
  erro binário; agora é 32, com divisão inteira para percentuais de duas casas.
  Incluídos testes de meios centavos e inteiros grandes. Contratos GET/mensagens
  e autoridade de limite também passaram; build Next/TypeScript aprovado.
- Escopo concluído: comandos manuais da aba Limites. A base financeira pode
  mudar fora dessa transação (JSON operacional e notas). Sync automático e
  reset/reconciliação ainda precisam da revisão conjunta de versões/fontes; a
  RPC não substitui proteção concorrente do operacional nem aceite das telas.
  Transferências/sweep continuam bloqueados pela trava de rollout existente.

### Sincronização — leitura indisponível não representa arquivo vazio (03/11)

- Leitura de contratos, operacional e avisos de lançamento agora distingue 404
  explícito de falha de rede/permissão, resposta incompleta ou JSON inválido.
  Estas falhas interrompem o fluxo em vez de fornecer uma base vazia ao escritor.
- Erros de listagem, criação e atualização do bucket também são propagados.
- Regressão `scripts/test-sync-storage-read-failure.mjs`: falhou antes da correção
  por ausência de rejeição; passou depois, incluindo nenhuma gravação após leitura
  inválida, arquivo realmente ausente e leitura válida. TypeScript sem erros.
- Compilação local encontrou panic do subprocesso CSS do Turbopack (antes de
  concluir). Conferir a compilação na Vercel antes de considerar esta versão pronta.
- Não resolve concorrência entre dois snapshots válidos. A gravação do JSON
  operacional ainda necessita confirmação atômica de versão e tratamento de
  conflito entre aparelhos. Nenhuma migração ou alteração de produção nesta etapa.

### Folha de outubro no painel Em aberto (04/11)

- Releitura somente leitura do banco oficial: 16 registros consolidados intactos.
  O painel oficial omitiria oito registros (R$ 24.293,23), pois o recorte de PIX
  considerava quitado o mês com entrega sem data única mesmo quando a ficha do
  consolidado estava fora do escopo do pagamento.
- A correção limita a exceção ao lote conciliado de outubro. Ficha realmente
  coberta pelo PIX continua fora da lista; nenhum saldo ou pagamento foi regravado.
- Simulação com os dados atuais: os 16 registros aparecem no painel corrigido.
  Teste de regressão confirma que PIX anterior não esconde o consolidado e que
  pagamento referenciando o consolidado o remove. Sem publicação em produção.
