# Changelog cooperado (por build)

Texto curto para **suporte** e **cooperativas**. Conferir versão no celular: badge **`v{N}`** no header do PWA.

Produção: https://hbcooperativas.vercel.app

---

## v358 (atual)

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
