# HB Cooperativas V1 — 795

Publicação autorizada pelo proprietário em 06/11/2026. Base oficial 794,
commit `252b7fa4512c105358613c5b7bb4160009249893`, deployment de retorno
`dpl_FdoEZyKoaUjgXm61AQYK6eaeJNyc`.

## Conteúdo

- Início e Financeiro do cooperado usam a mesma leitura de saldo da nuvem.
- Cache de QR e conta não escolhe o saldo maior de uma revisão antiga.
- Recuperação do responsável preserva registros atualizados e pagamentos
  confirmados, mantendo lançamentos manuais ausentes da consulta.
- JSON operacional, contratos e entregas evitam cache antigo do Storage.
- O pagamento informa a confirmação após a API aceitar o registro, antes
  das atualizações adicionais. Falhas posteriores não desfazem a confirmação.
- PIN de 4 a 8 dígitos é enviado pelo botão Pagar, depois da digitação.
- Comprovante permite compartilhar, copiar ou baixar texto, conforme o
  suporte do navegador. Cancelar o compartilhamento não gera outro envio.
- Comunicados preservam a fila de publicação após recarga e só limpam a
  geração confirmada. Falha na nuvem mantém a pendência.
- Dependências iguais às já verificadas em homologação, incluindo Next
  16.4.3, Node 24 e sharp 0.35.5.

## Limites desta publicação

Não aplica migrações, não importa folha, não regrava saldos oficiais e não
reprocessa a transferência de Jeferson para Jovane. Os repasses novos com
saldo próprio, a sincronização versionada e as mudanças de esquema do
pacote amplo permanecem na homologação para etapas posteriores.
As transferências entre cooperados ficam temporariamente pausadas no app,
incluindo criação de cobrança, validação e autorização de QR antigo.
Pagamentos em mercados continuam disponíveis. O bloqueio usa a configuração
existente de transferência e não modifica transações históricas.

A 795 usa os contratos de API e o esquema da 794. A reversão consiste em
devolver o domínio ao deployment 794, preservando os lançamentos feitos
na nuvem após a publicação. Não restaurar backup antigo sobre os dados.

## Validação

A compra fictícia de R$ 1 em homologação exibiu confirmação, comprovante
E2BD6CE8 e extrato. O saldo próprio passou de R$ 3 para R$ 2, o valor das
entregas permaneceu R$ 100 e o banco confirmou uma transação e dívida zero.
PIN longo incompleto foi reproduzido e corrigido. Caminhos de compartilhar,
copiar, baixar e cancelar passaram nos testes. A alternativa de download
depois da falha de cópia está coberta por teste com APIs simuladas.

Conferir tipos, gate de preservação, recibo, cache, pagamentos e compilação
da combinação final antes de publicar. Após publicar, conferir versão,
login e integridade das rotas oficiais. Não executar compras reais para QA.

Na composição final passaram os testes específicos de cache, comprovante,
PIN, fila de comunicados, pagamentos, recuperação do responsável, PWA e
pausa de transferência. Tipos passaram. O gate rápido passou em 146,8 s.
A auditoria de dependências de produção retornou zero vulnerabilidades.
Webpack com Node 24 concluiu a compilação e a conferência do bundle. As
tentativas locais de Turbopack falharam por acesso à fonte e criação de
processo no Windows. O build de publicação usa o fluxo padrão da Vercel.

Antes da publicação foi confirmada a identidade 794 e o SHA de retorno.
Backup de Storage cifrado concluído com 1.491 arquivos e 84.088.247 bytes,
com releitura e decriptação locais verificadas. Não inclui o banco SQL e
não comprova restauração física. Diretório local na worktree de segurança:
`backups/ifptyzikekrswippzmsf/storage-2026-11-07T01-51-33-052Z-aae2ea52`.

## Publicação confirmada

Produção publicada no deployment `dpl_6rmWu9Rxi1xkmQmiYQEC1VSAdhFr`,
com fonte `493f584ba708a3496bae11eb994433c05ba198d8` e estado READY.
O domínio `https://hbcooperativas.vercel.app` passou a apontar para esse
deployment. A compilação padrão por Turbopack concluiu na Vercel.

Verificações posteriores à troca do domínio:

- `/api/client-release` retornou 200, build 795, SHA e deployment esperados.
- `/sw.js` retornou 200 e cache `hb-coop-build-795-chunk-network-v1`.
- `/login` respondeu 200 com o HTML do aplicativo. No navegador, a sessão
  existente abriu o painel de gestão e mostrou `app v795`.
- `/api/credit/account` sem autenticação retornou 401.

Os três acessos fictícios de homologação foram desativados. A conta HB do
ensaio foi suspensa e teve o PIN de teste invalidado. O mercado fictício
voltou a PENDING. Os registros sintéticos de compra foram preservados para
auditoria. Nenhum aceite de termos foi feito durante o ensaio.

Usar a 795 como base oficial nas próximas correções. A candidata ampla em
homologação ainda contém etapas não publicadas; não promover seu build 790
diretamente nem reativar transferências antes de concluir o piloto.
