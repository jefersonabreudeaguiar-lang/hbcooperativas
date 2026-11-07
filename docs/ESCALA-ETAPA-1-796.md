# Escala — etapa 1, candidata 796

## Escopo e proteção da operação atual

Branch `codex/hb-scale-readiness`, derivada da candidata de homologação e integrada
à linha publicada 795. A integração preserva PIN por confirmação explícita,
comprovante compartilhável, pagamentos confirmados, leituras sem cache antigo e
a pausa de transferências. Não é autorização técnica para promover todas as
migrations financeiras nem ativar a gravação versionada na cooperativa oficial.

O guard de publicação aceita esta branch somente como Preview no projeto
`prj_1dqke8xRjtzsCouFEczEB4ZgmF10`, banco `ocyfzramxvxqbtkorubn`, com
`HB_HOMOLOGATION_ONLY=true`. O app oficial permanece 795 nesta etapa.

## Correções novas

- Autorização da API consulta o cadastro atual, sem ler hash de senha ou segredo
  TOTP. Conta removida/desativada é recusada imediatamente. Mudança de papel,
  cooperativa, titular ou e-mail exige novo login. Permissões atuais prevalecem
  sobre o token antigo. Falha de consulta retorna 503 e não libera acesso.
- Renovação da sessão não recria usuário ausente a partir do cookie antigo e não
  afirma MFA que não foi executado. Falha não emite cookie novo.
- Produção mantém autorização obrigatória mesmo com configuração de banco
  ausente. Desenvolvimento local sem nuvem permanece disponível.
- Verificador de release e seu gate de contratos usam o executável Node que
  iniciou o processo, evitando testar silenciosamente com Node 20 no Windows
  quando o deploy usa Node 24.
- Novas regressões incluídas na suíte e branch incluída no CI de segurança.

## Ensaio HTTP com banco real, 07/11/2026 UTC

Resultado estruturado: `SCALE-HTTP-ACCEPTANCE.json`. Servidor Next em
desenvolvimento local, Supabase de homologação, duas cooperativas fictícias.

1. Três logins reais: duas sessões independentes da cooperativa A e uma da B.
2. Leitura e escrita de outra cooperativa retornaram 403.
3. Duas escritas com a mesma revisão retornaram 201 e 409. Após releitura e
   reenvio, as duas alterações permaneceram. Revisão antiga continuou recusada.
4. Desativação recusou imediatamente os cookies já emitidos; renovação também
   retornou 401. Troca de cooperativa recusou o cookie antigo em ambos os CNPJs.
5. Limpeza administrativa confirmou zero usuários, cooperativas e snapshots
   fictícios restantes nos CNPJs reservados 99999999999994/95. Auditoria mantida.

Não houve transação financeira real, alteração do banco oficial ou validação de
interface neste ensaio. Durações incluem compilação e rede local→Supabase;
não representam benchmark de produção nem capacidade certificada.

## Recuperação e gates restantes

- Painel oficial confirmou backup COMPLETED de 06/11/2026 às 10:17 UTC.
- O proprietário recusou o custo de outro projeto. O formulário foi cancelado,
  sem criação ou contratação. O caminho de validação passou a ser local.
- A conexão Postgres de homologação passou com o certificado público indicado
  pelo painel do Supabase. TLS permaneceu validado; não foi usado bypass.
- A cópia cifrada da homologação foi restaurada em PostgreSQL 17 local, restrito
  ao loopback e ao usuário Windows. As 29 tabelas tiveram contagem e conteúdo
  conferidos. Dezesseis migrations foram aplicadas; as duas estruturas de CAS
  já existentes foram explicitamente puladas. Os dados originais permaneceram
  iguais após as migrations. Passaram 14 testes SQL e o cluster foi removido.
  Evidência: `LOCAL-RESTORE-ocyfzramxvxqbtkorubn-ACCEPTANCE.json`.
- Isso comprova restauração lógica do esquema público da aplicação, não a
  infraestrutura completa do Supabase. A cópia de arquivos é verificada à parte;
  as chaves cifradas por DPAPI ainda dependem do mesmo usuário/máquina.
- Ainda pendentes: restauração completa com arquivos e configuração, recuperação
  de chaves fora desta máquina, interface com conflito/recarga, carga medida,
  fechamento contábil e onboarding integral de uma nova cooperativa.
- Antes de ativar CAS no oficial, bloquear escritores antigos, ensaiar a ponte de
  retorno para o Storage e validar compatibilidade das migrations com o app de
  retorno. Não restaurar backup antigo sobre lançamentos oficiais posteriores.

Esta etapa reduz riscos comprovados. Não certifica expansão comercial ampla.

## Ensaio com cópia oficial e teste da interface

Com autorização específica do proprietário, o esquema público oficial foi
exportado em transação somente leitura e snapshot consistente, cifrado e
restaurado em PostgreSQL local. As 39 tabelas tiveram inventário, contagem e
conteúdo conferidos. Todas as 18 migrations foram exercitadas, sem pular arquivos;
os dados originais permaneceram iguais depois delas. Passaram os 14 testes SQL.
O cluster em texto aberto foi removido. A cópia cifrada permanece somente no
destino local autorizado. Evidência: `LOCAL-RESTORE-ifptyzikekrswippzmsf-ACCEPTANCE.json`.

O deployment `dpl_6ZeP3vXzdbzi2ybNpnfnaJchLfxh`, SHA `42e627a1`, ficou READY
na homologação com build 796. A interface do responsável fictício abriu painel,
Conferir entregas, Em aberto (3 cooperados, total R$ 380 no cenário sintético),
Pagar cooperados e Livro Caixa. Nenhum pagamento real foi executado. O acesso
fictício foi desativado, senha invalidada e zero acessos fictícios ativos conferido.

A conferência revelou dois eventos de pagamento com número 1 no Livro Caixa.
Um teste reproduziu o problema com contador anual atrasado em relação às linhas
já existentes. O alocador agora considera também os números efetivamente usados,
sem voltar atrás quando o contador está adiantado e sem renumerar registros
históricos. Débito e retenção do mesmo pagamento continuam no mesmo evento.
Releitura com contador perdido, isolamento de cooperativa/ano e repetição do
pagamento estão cobertos. Números históricos já conflitantes não foram regravados.
Esta correção ainda exige uma publicação posterior à SHA acima para estar no ar.

O deployment `dpl_2zE6E3zG3KqCMb5tA2eGtReEtpLv`, SHA `f4a69c5a`, publicou
a correção de sequência e ativou CAS somente no CNPJ sintético 88888888000181.
O teste de dois navegadores/origens revelou uma integração que faltava: a entrada
atualizada de staff carregava a versão da API, mas não guardava seu checkpoint.
O primeiro envio era recusado com "Abra os dados atualizados antes de salvar neste
aparelho". A nuvem permaneceu na revisão inicial, sem sobrescrita. O rascunho
local também permaneceu após recarga. Não contar isso como teste de conflito
entre duas gravações concluído.

A entrada staff agora guarda a revisão e a base local juntas. Ao recarregar com
checkpoint e edição pendente, não substitui nem confirma essa edição. Pendência
legada sem referência é recusada explicitamente, sem inventar uma base. A
regressão integrada cobre primeiro envio e recarga com alteração pendente.

No reteste real do deployment `dpl_D1LdQNvfPX2LAAjfMBaLGh87fUq9` (fe6dc86c),
a sessão A gravou e a sessão B recebeu recusa de conflito, sem sobrescrever a
nuvem. Porém, recarregar B perdeu seu rascunho. Portanto esse gate NÃO passou.
A entrada podia usar memória de primeiro paint anterior à cópia local durável.
A correção lê o arquivo local com escopo antes de qualquer consulta da entrada
e impede o bootstrap global antigo para perfis de gestão. O novo teste reproduziu
a perda antes da correção e passou depois, preservando checkpoint e outbox.
As 33 suítes de segurança locais passaram; falta repetir a prova no navegador.

A suíte ampliada de desempenho/fluxos revelou também um erro real no histórico
de pagamentos legados sem fichaIds. O histórico agora aceita essas listas ausentes
e pode localizar fichas pelos IDs das notas, com regressão dedicada. O teste
test-h814e-operacional-reset-safe passou após a mudança. A suíte ampliada ainda
não está toda verde: há verificações estáticas antigas e uma divergência no
cenário de coordenação push/bidirectional a investigar. Não constitui aprovação
de desempenho ou prontidão comercial.
