# HB Cooperativas — auditoria de preparação para expansão

Data: 01/11/2026, America/Fortaleza. Escopo: código V1, HB Crédito, dados da cooperativa atual, permissões do banco, dependências de produção e processo de entrega. Este diagnóstico não é certificação OCB, auditoria contábil independente, parecer jurídico ou teste de invasão completo.

## Decisão

**Expansão comercial para várias cooperativas ainda bloqueada.** Há uso real e funcionalidades relevantes, mas não há evidência suficiente para prometer escala, disponibilidade ou ausência de perda financeira. Uma demonstração controlada deve usar ambiente próprio e dados de demonstração, após homologação dos fluxos. Nenhum contato com a OCB foi realizado.

## Correções desta etapa

- Limites: duas contas antigas, sem uso pendente e vinculadas por entregas históricas aos cadastros atuais, somavam R$ 578,14 fora da seleção. Isso fazia a liberação de 70% atingir R$ 31.868,13 contra teto de R$ 31.289,99. Foram suspensas em transação, com cópia prévia e auditoria; registros históricos foram mantidos. A prévia posterior de 70% retornou R$ 31.289,99 contra o mesmo teto. O percentual de compra salvo permaneceu 20%; não foi executada nova liberação de 70%.
- Sincronização: contas suspensas não podem recuperar crédito automaticamente; gravações explícitas também recusam conta suspensa.
- Banco: habilitada proteção por linha na tabela auxiliar que estava sem RLS; retiradas permissões diretas de anon/authenticated nessa tabela e na função de transferência. Servidor mantém acesso service_role. Rechecagem: nenhuma das 36 tabelas do escopo sem RLS; nenhuma função HB SECURITY DEFINER executável pelos papéis públicos auditados.
- PIN: cadastro inicial não pode sobrescrever um PIN existente; cooperado e mercado devem seguir a redefinição pelo responsável. Atualização condicionada a pin_hash nulo protege contra corrida entre cadastros.
- Administração: removidas senha fixa, criação automática de administrador e redefinição de senha pelo navegador; portal usa o login do servidor. **Ainda é necessário trocar a senha administrativa pelo fluxo seguro do aplicativo**, pois removê-la do código não invalida versões antigas nem eventual senha já armazenada no servidor. Não foram alteradas senhas de pessoas nesta auditoria.
- Visão geral HB: totais oficiais passam a usar base autoritativa da nuvem, sem depender de prévia enviada pelo navegador.
- Mercado: consultas independentes passam a executar em paralelo, mantendo a geração de comprovantes depois da leitura das liquidações.
- Controle operacional: uma flag explicitamente desligada passa a prevalecer sobre a habilitação automática pela interface.

## Evidências da nuvem

26 cooperados atuais; 28 contas HB históricas, das quais duas duplicadas foram suspensas; seis mercados ativos; 66 transações históricas (28 compras confirmadas, 19 compras revertidas e 19 estornos); 47 recebíveis; três liquidações; 16 solicitações históricas de estorno. Estes números descrevem registros, não usuários simultâneos ou capacidade de escala.

Verificações SQL somente leitura, no conjunto consultado:

- Compras confirmadas sem recebível: 0.
- Compras revertidas com recebível OPEN/ELIGIBLE/PROCESSING: 0.
- Vínculos de compra com mercado de outro CNPJ: 0.
- Contas com usado negativo ou acima do limite: 0.

Isso demonstra consistência dos vínculos verificados. Não certifica que cada pagamento externo ou comprovante bancário corresponde à realidade; essa conciliação requer documentos e validação independente.

## Revisão por aba HB

**Visão geral:** base de cálculo e origem dos totais revisadas; servidor passa a calcular a base oficial. Falta homologação visual com responsável em celular e computador após publicação.

**Limites:** causa do erro reproduzida por diferença exata, dados duplicados corrigidos, proteção de contas suspensas testada e prévia real confirmada. Liberação coletiva ainda grava várias contas em etapas separadas: migração para transação única é bloqueador de expansão.

**Mercados:** seis cadastros ativos com percentuais registrados; consultas, vínculo autenticado, termos, PIN e PIX revisados no código. Proteção contra sobrescrita de PIN e paralelismo implementados. Cobrança real, leitura do QR, recusa de PIN e comprovante precisam de homologação em ambiente de teste; não foram feitas compras reais para testar.

**Descontos:** rotas exigem equipe financeira e CNPJ; existe projeção de compras na ficha. Falta conciliação automatizada de ponta a ponta entre compra, desconto, pagamento do cooperado, cashback e razão contábil, com competência e fechamento.

**Conferir NFs:** escopo de cooperativa/mercado revisado; existe política de dispensa de NF do cooperado. Pendência: validar a política fiscal/comercial de cada cooperativa e testar envio, rejeição e reapresentação em homologação. A auditoria não aprovou documentos reais.

**Liquidar:** autorização por cooperativa ou pelo próprio mercado e exigência de comprovante revisadas. Três registros históricos encontrados. Pendência: teste completo de fechamento, segunda tentativa, comprovante e retorno após reiniciar; conciliação bancária externa não executada.

**Estornos:** 19 compras revertidas têm 19 transações de estorno; nenhum recebível dessas compras permaneceu aberto nos estados auditados. Pendência: teste concorrente entre estorno e liquidação e conferência completa dos valores de razão, sem usar dinheiro real.

**Cooperado:** identidade, conta, PIN, pagamento e extrato revisados nos fluxos HB. Pendências: eliminar seleção de conta por maior saldo entre IDs do mesmo titular, adotar identidade financeira canônica e testar sessão antiga, falta de rede e repetição de confirmação.

## Bloqueadores para escalar

### P0 — antes de novas cooperativas

1. **Dependências vulneráveis.** npm audit --omit=dev retornou sete alertas: dois críticos, quatro altos e um moderado, diretos e transitivos. Next e Sharp estão entre os pacotes diretos afetados. Atualizar em ambiente isolado, ler guias da versão, repetir testes financeiros, imagens, PWA e autenticação. Não foi feita atualização ampla automática nesta correção.
2. **Atomicidade dos limites.** O fluxo coletivo faz leituras e upserts separados, com leitura prévia do valor usado. Uma compra concorrente pode competir com a gravação. Exigir função transacional no banco que preserve o uso, valide teto, grave percentual e contas juntos e registre auditoria ou reverta tudo.
3. **Identidade financeira única.** A correção atual removeu duas duplicatas confirmadas; ainda existe lógica de escolha por maior saldo entre IDs. Criar chave canônica por cooperativa, migrar referências com histórico e impedir uma segunda conta ativa do mesmo titular.
4. **Troca segura da senha administrativa anteriormente exposta no código.** Remoção do código não revoga credenciais já conhecidas ou sessões existentes. A troca deve ser feita pelo titular, sem enviar senha nesta conversa.
5. **Homologação multiempresa e financeira realista.** Testar cooperado, responsável, tesoureiro e mercado em pelo menos três cooperativas isoladas de teste; repetir compras, estornos e liquidações com falhas de rede e concorrência. Nenhum teste de carga multiempresa foi executado nesta auditoria.

### P1 — operação profissional

6. **Persistência operacional em JSON integral.** uploadOperacionalSync lê e sobrescreve operacional.json. Guardas preservam partes importantes, mas não substituem transação, versão esperada e tratamento de conflito. Migrar razão e lançamentos para registros transacionais; manter cache local como apoio.
7. **Observabilidade e suporte.** Instrumentar falhas por versão, etapa e cooperativa sem dados sensíveis; medir p95 de abertura, confirmação e troca de foto; criar alarmes, fila de reprocessamento e procedimento de atendimento.
8. **Proteção contra abuso distribuída.** Existe implementação opcional de limite distribuído e fallback em memória; a configuração real de produção não foi confirmada pelo conector, que oculta parte das variáveis. Comprovar proteção compartilhada entre instâncias para login, PIN e cobranças.
9. **Entrega e regressão.** Os três fluxos CI inspecionados selecionam main e não a branch que está sendo publicada. Criar gate obrigatório na branch efetivamente usada, ambiente de homologação e bloqueio de publicação com teste crítico falhando. O teste legado de paridade foi alinhado ao contrato atual: GET só lê a conta; a autorização de pagamento exige base persistida. Os testes de invariantes financeiros continuam obrigatórios.
10. **Recuperação.** Há scripts e cópias locais; não foi executada restauração completa em ambiente separado nem comprovado RPO/RTO. Demonstrar recuperação, retenção, controle de acesso e restauração conjunta de banco, mídias e configurações.
11. **Competência e fuso.** Padronizar cálculo de mês no servidor pelo fuso de negócio; há rotas que usam data local do servidor, podendo divergir da data do usuário perto da virada do mês.

### P2 — oferta para outras cooperativas

12. Implantação guiada de nova cooperativa: contratos, preços, papéis, permissões, mercados, importação e conferência inicial de saldos.
13. Documentação operacional por perfil, central de ajuda e treinamento; regras de estorno, fechamento e comprovação.
14. Plano de serviço: custos por volume, armazenamento e suporte; limites contratuais e responsabilidades. Custos e capacidade ainda não foram medidos em carga.
15. Documentação de privacidade, retenção, contratos com parceiros e revisão jurídica do modelo HB Crédito. Não se presume adequação jurídica apenas pelo funcionamento do software.

## Plano de execução e critérios de saída

**Etapa 1 — estabilização atual:** publicar a versão 786, confirmar login e sete abas com contas de teste, validar percentual e PIN sem compras de produção, manter a suíte de paridade passando. Saída: todos os testes críticos passando e nenhuma divergência de teto.

**Etapa 2 — núcleo financeiro:** transação única para limites, identidade única e razão conciliável. Saída: testes de concorrência não perdem uso nem duplicam lançamento; erro reverte integralmente a operação.

**Etapa 3 — plataforma:** atualizar dependências críticas, isolar tenants, automatizar implantação, observabilidade, backups e restauração. Saída: três cooperativas de teste isoladas, recuperação comprovada e pipeline bloqueando regressões.

**Etapa 4 — piloto e OCB:** piloto controlado com metas e responsáveis, demonstração com dados próprios de teste, evidências de benefício e material comercial. Metas propostas de engenharia, ainda não medidas: p95 de leitura abaixo de 2 s em carga acordada; próxima foto já antecipada abaixo de 1 s; zero perda/duplicação nos cenários de repetição e concorrência. A carga de referência e o plano de recuperação devem ser definidos antes do piloto.

A OCB oferece soluções de inovação e diagnóstico por meio do Inovacoop. Isso pode servir de porta de entrada para avaliar um piloto; não significa aprovação, parceria ou certificação do HB Cooperativas. Fontes: https://www.somoscooperativismo.coop.br/solucoes/inovacoop e https://inova.coop.br/diagnostico-de-inovacao .

## Limites desta auditoria

Foram revisados código, rotas e guardas dos fluxos indicados, permissões PostgreSQL em leitura, registros atuais da cooperativa e dependências. Houve duas manutenções de dados/segurança expressamente descritas, com auditoria. Não houve compra, liberação nova de crédito, pagamento, estorno, assinatura de termo ou envio de documentos reais. Não houve teste de invasão exaustivo, teste de carga, auditoria de todas as telas com cada perfil, conciliação bancária ou parecer jurídico. Esses itens permanecem critérios de saída, não resultados já obtidos.
