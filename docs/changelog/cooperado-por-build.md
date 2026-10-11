# Changelog cooperado (por build)

Texto curto para **suporte** e **cooperativas**. Conferir versão no celular: badge **`v{N}`** no header do PWA.

Produção: https://hbcooperativas.vercel.app

---

## v292 (atual — referência baseline)

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
