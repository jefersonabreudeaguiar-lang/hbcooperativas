# Changelog cooperado (por build)

Texto curto para **suporte** e **cooperativas**. Conferir versão no celular: badge **`v{N}`** no header do PWA.

Produção: https://hbcooperativas.vercel.app

---

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
