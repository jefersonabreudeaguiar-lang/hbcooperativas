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
  **Ainda não aplicada:** a confirmação do conector Supabase expirou duas vezes.
- A homologação financeira permanece pendente de compatibilidade estrutural,
  rotinas revisadas, dados fictícios e testes completos. Produção permanece 790.
