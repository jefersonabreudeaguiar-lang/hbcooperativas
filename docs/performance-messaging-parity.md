# HB Coop vs WhatsApp — paridade de performance (UX)

Objetivo: comparar a sensação de app de mensagem (referência **WhatsApp**, app nativo) com o PWA cooperado, em **milissegundos** e **notas 0–10**, sem alterar fichas, resumos ou sync de negócio.

## SLO interno (HB)

- Troca de aba cooperado (L1): **paint p75 &lt; 200 ms** (`rql:route:*` + `rql:route-paint:*`).

## Referência WhatsApp (homolog)

| Dimensão | Faixa típica | Nota ref. |
|----------|--------------|-----------|
| Troca de aba | ~30–80 ms | 9,5 |
| Haptic / feedback | nativo | 9 |
| Toque → reação | &lt; 50 ms | 9,5 |
| Cold start | ~0,5–1,5 s | 9 |

## O que o HB já faz (cooperado mobile)

- `vibrate(10)` + **pulso visual** 180 ms na troca de aba (`tabSwitchFeedback.ts`).
- **Warmup** do chunk da aba no `pointerdown` (`cooperadoTabPointerWarmup.ts`).
- **Keep-alive** LRU de abas + prefetch Next nas 5 rotas do rodapé.
- Marcas RQL por rota (`AppSchedulerBootstrap`) com hop por aba (`ficha-corrida`, `notas-pedido`, …).

## Medir no dispositivo

1. Defina `NEXT_PUBLIC_RQL_PERF_DEBUG=1` (homolog) e abra o PWA cooperado.
2. Troque entre as 5 abas do rodapé várias vezes.
3. No console do DevTools:

```js
window.__hbRqlPerf.print();
window.__hbRqlPerf.printWhatsappCompare();
```

A tabela `printWhatsappCompare` traz **whatsappScore** (referência) vs **hbCoopScore** (medido + estimativas onde não há telemetria).

## Interpretação

- **hbCoopScore** na troca de aba usa o **paint p75** real das marcas RQL.
- Dimensões sem sensor automático (cold start, scroll) aparecem como referência fixa até medição dedicada (`rql:cold:*`).
