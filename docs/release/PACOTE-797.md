# Candidata 797 — pacote selecionado para aprovação

Base exata: produção 795, commit `493f584ba708a3496bae11eb994433c05ba198d8`.
Branch `codex/hb-release-797-ready`. A versão 796 de escala não será promovida.

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
- `test-release-797.mjs`: 15 suítes isoladas passaram.
- `run-release-verify.ts --fast`: passou com os contratos originais da 795.
- HTTP real, Next local e banco de homologação: login 200, leitura própria 200,
  leitura e escrita de outra cooperativa 403, desativação e mudança de vínculo
  recusadas 401, inclusive na renovação. Conta descartável removida ao terminar.
- Auditoria de dependências de produção: zero vulnerabilidades reportadas.
- Build e interface do deployment candidato: registrar resultado antes do OK.

Os ensaios HTTP não são prova de capacidade/p95 em produção. A suíte ampliada
antiga de desempenho não foi declarada aprovada. Expansão comercial permanece
uma etapa separada.

## Publicação e retorno

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
