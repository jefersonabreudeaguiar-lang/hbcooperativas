# Changelog cooperado (por build)

Texto curto para **suporte** e **cooperativas**. Conferir versão no celular: badge **`v{N}`** no header do PWA.

Produção: https://hbcooperativas.vercel.app

---

## v530

- **Responsável:** o Livro caixa abre de novo após o F5 — acha a cooperativa pelo CNPJ da sessão, como o Conferir.
- **Livro caixa:** a tela não fica em branco enquanto o lastro chega.
- **Cooperado:** Início, Entregas, Ficha, Financeiro e A receber iguais ao v529.

## v529

- **Responsável:** valor já lançado na ficha some do Conferir — o lastro não reabre o card com o R$ antigo.
- **Conferir:** fila vazia depois de lançar não puxa de volta as fotos da nuvem.
- **Cooperado:** Início, Entregas, Ficha, Financeiro e A receber iguais ao v528.

## v528

- **Responsável:** foto já lançada na ficha não volta para Conferir entregas no F5.
- **Conferir:** o lastro guarda a fila que ainda não lançou; não reabre o que já está na ficha.
- **Cooperado:** Início, Entregas, Ficha, Financeiro e A receber iguais ao v527.

## v527

- **Responsável:** lançamento do Livro caixa não some no F5 — o que já estava no aparelho fica, e o salvar já manda para a nuvem.
- **Livro caixa:** origem cadastrada também sobrevive ao refresh; exclusão publicada continua valendo.
- **Cooperado:** Início, Entregas, Ficha, Financeiro e A receber iguais ao v526.

## v526

- **Responsável:** Livro caixa ganha pastas por origem — cadastra a origem, lança e o valor fica no livro e na pasta.
- **Livro caixa:** em cada pasta dá para emitir o relatório só daquela origem.
- **Cooperado:** Início, Entregas, Ficha, Financeiro e A receber iguais ao v525.

## v525

- **Atalho PWA:** a versão nova chega no ícone instalado — sem sair do app e sem apagar cache ou cookie.
- **Atualização:** o Início abre na hora; depois o HTML antigo é trocado uma vez se a nuvem estiver na frente.
- **Cooperado:** Entregas, Ficha, Financeiro e A receber iguais ao v524.

## v524

- **Entregas:** o histórico do mês não some quando um sync pobre chega vazio — a lista junta lastro, ficha e o que já estava no aparelho.
- **Minha ficha:** Extrato, Pagamentos e Fotos por mês mostram os valores reais de cada mês, mesmo se a nuvem atrasar.
- **Cooperado:** Início, Financeiro e A receber iguais ao v523.

## v523

- **A receber:** o desconto da compra HB aparece no Início e no Financeiro no mesmo ritmo do card HB — a ficha manda; se a linha ainda não gravou, o lastro local cobre.
- **Financeiro:** o valor não some na abertura; a linha da compra entra no resumo sem esperar o operacional inteiro.
- **Cooperado:** Entregas e troca de abas iguais ao v522.

## v522

- **HB Créditos:** no celular, a compra feita no mercado entra na ficha depois que o Início já abriu — sem puxar o operacional inteiro.
- **A receber:** Início e Financeiro passam a mostrar o valor já descontado, sem esperar Atualizar.
- **Cooperado:** Entregas e troca de abas iguais ao v521.

## v521

- **HB Créditos:** a compra já gravada na ficha não some quando o Atualizar ou a nuvem vêm vazios.
- **A receber:** depois do desconto HB na ficha, o valor no Início e no Financeiro baixa de verdade.
- **Cooperado:** Entregas e abertura do app iguais ao v520.

## v520

- **HB Créditos:** a compra grava o desconto na ficha na hora do PIN — a linha aparece no Financeiro.
- **A receber:** Início e Financeiro já mostram o valor com o HB descontado, sem esperar Atualizar.
- **Cooperado:** Entregas e abertura do app iguais ao v519.

## v519

- **HB Créditos:** cada compra desconta a ficha do mês da compra (ou a última ficha ainda em aberto).
- **A receber:** depois da compra, o valor no Início e no Financeiro já sai com o HB descontado.
- **Cooperado:** Entregas e abertura do app iguais ao v518.

## v518

- **Mercado HB:** compras com crédito não pedem mais nota fiscal do cooperado; o valor já fica liberado para receber.
- **Mercado:** aviso da Direção no painel (20/10/2026). Início, Financeiro e Entregas do cooperado iguais ao v517.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v517.

## v517

- **Responsável:** Em aberto e Pagar voltam a mostrar cooperados e valores da ficha ainda sem PIX.
- **Pagar:** deixa de aparecer «nenhum pagamento pendente» quando ainda há valor em aberto.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v516.

## v516

- **Responsável:** depois que o admin confirma o pagamento da mensalidade do app, a cobrança some neste ciclo.
- **Admin:** a confirmação grava na nuvem de verdade — se falhar, o painel avisa para tentar de novo.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v515.

## v515

- **Responsável:** Pagar cooperados abre de verdade — não cai mais na tela «não terminou de carregar».
- **Pagar:** a fila e o valor da ficha em aberto continuam iguais ao v509.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v514.

## v514

- **Responsável:** Conferir entregas abre com a fila salva no aparelho — a nota do cooperado não some até o lançamento na ficha.
- **Em aberto:** a lista do lastro aparece na hora; abrir a aba não esvazia o painel.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v513.

## v513

- **Ficha:** Minha ficha abre com todos os meses do lastro — não fica vazia esperando a nuvem.
- **Fotos:** Fotos por mês junta as fotos da Ficha e do Financeiro; toque amplia e passa na sequência.
- **Entregas:** a lista acompanha o lastro quando a aba está aberta.

## v512

- **Entregas:** o histórico completo por mês continua na lista — não some depois de conferir.
- **Ficha:** Minha ficha mostra todos os meses com entrega, valor e itens.
- **Fotos:** Fotos por mês tem todas as fotos do mês; toque amplia e passa na sequência.

## v511

- **Responsável:** Conferir → Correções lista os cooperados com nota ainda sem liquidar.
- **Correção:** Relançar volta a nota à fila com as fotos; Apagar remove a entrega. Nota paga não muda.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v510.

## v510

- **Abas:** Início, Entregas, Financeiro e Preços trocam na hora — a aba já visitada reaparece sem travar.
- **Dados:** a ficha e o sync continuam depois do toque, sem esperar a nuvem para mudar de aba.
- **Financeiro / Entregas / HB:** iguais ao v509.

## v509

- **Responsável:** Pagar cooperados abre na aba Pagar e a fila de quem ainda tem a receber não some no F5 nem no sync.
- **Pagamento:** o valor continua o da ficha em aberto; quem já tem PIX confirmado não volta para a lista.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v508.

## v508

- **Abertura:** o Início aparece na hora ao tocar no app, com o último A receber do aparelho.
- **Login:** entra sem esperar a nuvem — o sync continua em segundo plano.
- **Ficha / Financeiro:** iguais ao v507.

## v507

- **Ficha:** o Extrato mostra as entregas do mês em aberto e as do mês anterior.
- **Fotos:** depois da liquidação, as fotos vão para Ficha → Fotos por mês, uma aba por mês.
- **Financeiro:** a aba Foto a receber fica só com as fotos do mês em aberto.

## v506

- **Preços:** a aba volta a mostrar o valor de cada item do contrato no celular.
- **Dados:** o catálogo fica gravado no aparelho depois do sync — não some ao trocar de aba.
- **Início / Financeiro / Entregas:** iguais ao v505.

## v505

- **Responsável:** F5 não apaga mais o painel — a última tela reaparece na hora, sem precisar trocar de aba.
- **Cooperado:** quando o responsável lança ou confirma a entrega, só aquele cooperado recebe um aviso e atualiza a ficha na hora.
- **Início / Financeiro / Entregas:** iguais ao v504; o que mudou é a velocidade da atualização.

## v504

- **A receber:** o card continua na tela ao fechar o app; quando a ficha sobe, o valor do card sobe junto.
- **Abertura:** o celular puxa a ficha nova na hora, sem esperar dois minutos.
- **Financeiro / Entregas:** iguais ao v503.

## v503

- **Atualizar:** o botão não trava mais o app — puxa a ficha sem esperar o arquivo inteiro duas vezes.
- **A receber / Financeiro:** ao reabrir o app, o valor acompanha a nota que o responsável já aprovou.
- **Entregas:** a lista de aprovadas continua igual; o que mudou é o dinheiro da ficha chegar junto.

## v502

- **Cooperado:** quando o responsável aprova a entrega, o valor a receber e o HB Créditos atualizam junto — não fica só a lista de entregas.
- **Início / HB:** o celular puxa a ficha depois da nota aprovada, sem precisar ficar no valor antigo.
- **Responsável:** Conferir e Em aberto iguais ao v501.

## v501

- **Conferir entregas:** a foto que o cooperado já enviou aparece com o nome certo — não some como «Desconhecido».
- **Fila:** a entrega nova sobe para o topo; se o responsável estiver em Em aberto, a Fila abre sozinha.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v500.

## v500

- **Responsável:** Pagar, Em aberto e o card «A pagar» do Início passam a mostrar o mesmo valor real da nota conferida — não fica R$ 0 só porque a ficha ainda não gravou.
- **F5:** se o arquivo local falhar, o painel recupera o lastro da sessão em vez de zerar.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v499.

## v499

- **Conferir entregas:** quando o cooperado envia as fotos, a nota aparece sozinha na fila do responsável — sem F5 e sem apertar Atualizar.
- **Foto:** o painel busca a entrega nova a cada poucos segundos e já traz a foto junto.
- **Outras abas:** mesmo se o responsável estiver no Início ou em Pagar, a entrega já chega; ao abrir Conferir, ela já está lá.

## v498

- **Conferir entregas:** as notas que o cooperado enviou voltam a aparecer na fila — o app busca a lista completa na nuvem, não só o que mudou por último.
- **Em aberto:** o valor da ficha não some no Atualizar. O painel guarda o lastro; se a nuvem vier vazia, o que já estava na tela permanece.
- **Atualizar:** puxa notas novas sem apagar ficha/PIX que já estavam no aparelho.

## v497

- **Responsável:** o botão Atualizar puxa notas, ficha e PIX da nuvem — não empurra o aparelho nem apaga o painel.
- **Atualização:** se a nuvem trouxer dado novo, entra; se vier vazio, o que já estava na tela permanece.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v496.

## v496

- **Responsável:** ao resetar a página, o que já estava no aparelho permanece — o painel não some nem zera.
- **Atualização:** se a nuvem trouxer dado novo, entra; se vier vazio, o lastro local fica.
- **Leve:** nas abas da gestão o sync é discreto (notas), sem puxar o operacional a cada passagem.

## v495

- **Pagar cooperados:** o valor a pagar volta a ser o da ficha em aberto, como no backup 404 — não usa um consolidado zerado.
- **Lista:** quem tem nota conferida ainda sem PIX continua na fila.
- **Cooperado:** Início, Financeiro e Entregas iguais ao v494.

## v494

- **Financeiro:** o card «A receber» sai desta aba — ele continua só no Início.
- **Resumo:** a ficha em aberto aparece com bruto, desconto da cooperativa, Desconto HB e o total líquido.
- **Entregas:** lista por item (quantidade, preço e valor) e o **Total em aberto** da ficha no rodapé.

## v493

- **A receber:** cada atualização do app busca a ficha na nuvem para todos os cooperados. Enquanto não chega, mostra «Atualizando» — não pinta R$ 0,00 à toa.
- **Financeiro:** a aba abre mesmo sem cache local (não fica em branco). O valor aparece quando a ficha chega; só some na liquidação do responsável.
- **Todos os cooperados:** o novo build não confirma «ok» no celular até o valor estar na tela (ou o pagamento ter sido confirmado).

## v492

- **A receber / Financeiro:** o valor não some mais quando o celular guarda um resumo zerado. Ele só zera se o responsável confirmou a liquidação.
- **PWA:** ao abrir o Financeiro com R$ 0,00, o app busca a ficha na nuvem e redesenha o resumo (entregas + Desconto HB).
- **HB Créditos:** a conta volta a ser gravada junto com o resumo, mesmo na abertura leve — deixa de ficar em branco quando a ficha tem valor.

## v491

- **Entregas:** o aviso «Aguardando contrato da cooperativa» não trava mais o envio da foto. Dá para tirar e mandar mesmo se o contrato ainda estiver carregando.
- **Conferir:** as fotos voltam a chegar na fila do responsável; o contrato é o da última entrega ou o publicado na nuvem.
- **Atualizar:** o toque em Atualizar também puxa o contrato da cooperativa (antes pulava essa parte).

## v490

- **Deploy:** o 489 não chegou ao ar por um erro de typecheck no crédito-base HB; este build corrige isso e publica o a receber que permanece ao sair.
- **Financeiro:** resumo com Desconto HB Créditos e entregas com quantidade, preço por kg/dúzia e total.
- **HB Créditos:** a conta só zera na liquidação confirmada pelo responsável.

## v489

- **A receber:** ao sair do app o valor fica gravado. Ele só muda com desconto ou acréscimo, e só some se o responsável confirmou a liquidação.
- **Financeiro:** o resumo principal mostra entregas, descontos e sempre a linha Desconto HB Créditos. Outro resumo lista cada item com quantidade, preço por kg ou dúzia e o total.
- **HB Créditos:** a conta não zera quando o snapshot da ficha vem vazio. O zero entra só na liquidação registrada pelo responsável.

## v361 (atual)

- **Performance:** Início com folha L1 (`CooperadoInicioCooperadoLiveRoot`) — um subscribe de cooperado para saudação/assinatura; abas mobile com política `361-inicio-live-l1` (financeiro dormant + gate financeiro na casca).
- **Entregas:** compressão de foto no worker (L4) com `File` no thread e encerramento em idle.
- **Dados:** responsável não exibe «a receber» de cooperado já pago quando a ficha no operacional ficou pendente após o PIX — alinha com o registro de pagamento e repara status na sync.

## v360

- **Entrada no app:** menos espera no «Preparando…» após login — reparo de perfil não bloqueia o shell quando a sessão já está pronta; menos chamadas repetidas a `/api/client-release`; AppData aquece mais cedo no PWA.

## v359

- **Entregas:** anexar foto mais rápido — compressão entrega otimizada, pipeline/worker aquecidos ao abrir a câmera, menos espera até liberar a próxima foto.

## v358

- **Entregas:** botão «Enviar foto da entrega» no Início volta a abrir a câmera (navegação alinhada às abas + `?anexar=1` mesmo com AppData aquecendo).

## v357

- **Performance:** volta ao padrão melhor-performance nas abas Início/Financeiro (reverte otimização experimental v356; mantém cold start v355).

## v356

- **Performance:** troca Início ↔ Financeiro no PWA — sem re-hydrate/AppData no frame quando o painel já está em cache (dual-mount). *(substituída por v357 — baseline padrão.)*

## v355

- **Performance:** cold start PWA no padrão melhor-performance — sem registro ativo de service worker após o 1º paint (limpeza de SW legado; atualização via rescue/shield).

## v307

- **Estabilidade PWA:** menos tela branca/reload ao voltar ao app — release shield não força atualização quando o bundle já é o atual; menos reload duplo do service worker.

## v306

- **HB Créditos / QR mercado:** validação do QR não espera mais o sync pesado de limite — tela de PIN abre bem mais rápido; o alinhamento de limite roda em paralelo e na confirmação do PIN.

## v305

- **Dados:** badge “desatualizado” no header quando snapshots faltam ou a nuvem está à frente; após lançamento do responsável, pull só operacional (sem notas) e rematerializa A receber/Financeiro.
- **UX:** faixa inferior “busque dados — Atualizar” só com cache financeiro vazio (ex.: limpar dados do PWA).
- **Performance:** sem sync completa automática quando só operacional mudou; vigia de revisão existente reutilizada (sem poll novo na UI).

## v304

- **Dados:** PWA mensageiro detecta lançamento do responsável (~45s) e rematerializa snapshots após sync silenciosa.

## v294

- **HB Créditos:** com a receber zerado, “utilizado” e totais do dashboard passam a 0 (Orlando/casos sem `hbTransactionId` no PIX); heal do novo ciclo em toda leitura de limites/dashboard.

## v293

- **HB Créditos:** ao quitar o a receber (pagamento do responsável), zera liberado/usado na nuvem para novo ciclo; sync HB no `registrar-pagamento`; auto-correção na aba Limites e Minha Conta HB.

## v292 (referência baseline)

- **Performance:** fluxo de foto sem reload no meio (guard de release/SW); menos manutenção pesada com modal de anexar aberto no PWA leve; sync pós-envio em idle.
- **Dados:** paridade Início ↔ Financeiro via snapshots v2; hydrate local quando falta paridade após atualizar o app.
- **Entregas:** envio mais rápido (sem confirmação duplicada na nuvem); pull de notas só no anexar/enviar no mobile instalado.

## v291

- **Performance:** badge `v291` no header — só constante de build, sem faixa de sync na shell.
- **Dados:** política mensageiro e materialização de caches após sync mantida (builds 288–290).
- **Entregas:** sem mudança de fluxo em relação a 290.

## v290

- **Performance:** gate melhor-performance e PWA mensageiro estáveis em produção.
- **Dados:** correção de leitura do card Início no PWA (typecheck + paridade no snapshot).
- **Entregas:** sync de release no mensageiro quando snapshot operacional desatualizado.

## v288–289

- **Performance:** abas cooperado em leitura por snapshot; AppData não assina cada sync na UI.
- **Dados:** paridade materializada; bridge Início ↔ Financeiro; ficha snapshot v2 com `paridade`.
- **Entregas:** resumos PWA materializados após sync; entregas leve no mobile instalado.

## v287

- **Performance:** remoção da faixa pesada de release no cooperado (volta ao shell leve).
- **Dados:** Financeiro dormant no PWA mensageiro.
- **Entregas:** defer de sync de notas até fluxo de envio (mobile).

## v283 (marco legado — recibo)

- **Performance:** baseline RQL “melhor-performance” documentada.
- **Dados:** recibo assinado persistido na nuvem após confirmação de pagamento.
- **Entregas:** políticas gerais de sync cooperado manual/event-driven.

---

### Como publicar o próximo build

1. Incrementar `src/lib/appBuildVersion.ts` e `public/sw.js`.
2. Adicionar seção **v{N}** acima com 3 bullets (performance, dados, entregas).
3. Atualizar `referenceBuild` em `docs/baselines/melhor-performance-manifest.json` se for nova referência.
4. `npm run gate:melhor-performance` → merge → `npm run confirm:production:wait -- --expect-sha <sha>`.
