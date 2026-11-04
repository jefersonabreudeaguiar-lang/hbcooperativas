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
