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
