# HB Coop vs WhatsApp — paridade de performance (UX)

Objetivo: sensação de app de mensagem (referência **WhatsApp**) no PWA **cooperado** e **responsável**, em ms e notas **0–10**, sem alterar fichas, resumos ou sync de negócio.

## Metas por fase

| Fase | Troca de aba (paint p75) | Nota média HB (ref.) | Escopo |
|------|--------------------------|----------------------|--------|
| **1** (atual) | ≤ 200 ms (SLO interno) | ~7 → 8 | Warmup pointerdown, prefetch idle, haptic+pulso, keep-alive, RQL |
| **2** (191+) | ≤ 120 ms | ~8,5 | `shell_interactive`, boot secundário em idle, warmup de aba adiado |
| **3** | ≤ 80 ms (faixa WhatsApp) | ≥ 9 | Cold start &lt; 1,5 s, scroll estável, sync silencioso invisível |

Referência WhatsApp (app nativo, celular médio): troca de aba ~30–80 ms, cold start ~0,5–1,5 s.

## SLO interno (HB)

- Troca de aba L1: **paint p75 &lt; 200 ms** (`rql:route:*` + `rql:route-paint:*`).
- Meta fase 3: **p75 &lt; 80 ms** (mesma ordem de grandeza do WhatsApp).

## Cooperado + responsável (build ≥ 185)

- `vibrate(10)` + **pulso visual** 180 ms (`tabSwitchFeedback.ts`) nas abas mobile.
- **Warmup** do chunk no `pointerdown` — `cooperadoTabPointerWarmup.ts` / `staffTabPointerWarmup.ts`.
- **Prefetch** em camadas (`cooperadoNavPrefetch` / `staffNavPrefetch` + chunks das rotas).
- **Keep-alive** LRU (`CooperadoMobileTabKeepAlive` / `StaffMobileTabKeepAlive`).
- RQL por hop de aba (`AppSchedulerBootstrap` — cooperado e staff bottom tabs).
- Cold start: marcas `rql:cold:*` → span em `printWhatsappCompare`.

## Medir no celular (PWA, sem console)

1. Na faixa inferior do app (badge **`v192`** ou superior), **segure ~1 segundo** no número da versão.
2. Toque **Ativar medição e recarregar**.
3. Use o app (troque abas; opcional: feche e reabra).
4. Segure de novo no **`v…`** → **Gerar comparativo WhatsApp** → **Copiar relatório** (cole no WhatsApp/e-mail).

## Medir no dispositivo (DevTools)

1. **Ativar medição** (uma das opções):
   - Vercel: variável `NEXT_PUBLIC_RQL_PERF_DEBUG=1` e redeploy; ou
   - Neste aparelho: `localStorage.setItem("hb-rql-perf-debug","1"); location.reload();`; ou
   - URL: `?hbRqlPerf=1` (flag de sessão; recarregue a página).
2. Abra o PWA (cooperado ou responsável no celular).
3. Troque abas do rodapé; opcional: feche e reabra para cold start.
4. Console (o objeto existe sempre; tabelas só com debug ligado):

```js
window.__hbRqlPerf.print();
window.__hbRqlPerf.printWhatsappCompare();
// alias: window.__hbRq1Perf.printWhatsappCompare()
```

## Interpretação

- **hbCoopScore** na troca de aba usa paint p75 real.
- **cold_start** usa `coldStartSpanMs` quando há marcas `rql:cold:*`.
- Gap &gt; 1,0 na nota média → priorizar fase 2 (long tasks / bundles).

## Teste unitário

```bash
npx tsx scripts/test-messaging-perf-parity-unit.ts
```
