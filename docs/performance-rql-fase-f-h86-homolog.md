# Fase F — homolog RQL 8.6 (abas cooperado mobile)

Checklist manual no celular (ou DevTools mobile) com cooperado logado.

## Pré-requisitos

- `NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE` **não** definido ou `true` (default 8.6)
- Barra inferior: Início, Notas, Preços, Financeiro, Mensalidades

## Troca de aba (SLO L1)

1. Abrir **Início** → aguardar cards estáveis.
2. Tocar **Notas** → skeleton breve (`loading.tsx`) ou painel instantâneo se keep-alive; **sem** freeze longo do scroll anterior.
3. Repetir **Preços → Financeiro → Mensalidades → Início**.
4. No console (Performance):

```js
// colar após importar bundle ou usar marcas existentes
performance.getEntriesByType("mark").filter(m => m.name.startsWith("rql:route-paint:")).slice(-5)
```

Meta doc: **p75 paint &lt; 200 ms** entre abas (compare com `summarizeRqlRouteTimings()` no desktop).

## Keep-alive

1. Em **Notas**, rolar a lista.
2. Ir a **Preços** e voltar a **Notas** dentro de ~2 min.
3. Esperado: posição de scroll **preservada** (aba ainda montada no LRU).

## RAM baixa

- Simular ou usar aparelho limitado: keep-alive mantém no máximo **1** aba extra (+ atual); troca ainda fluida com prefetch.

## Desligar (rollback)

`NEXT_PUBLIC_COOPERADO_TAB_KEEP_ALIVE=false` — comportamento clássico (remount a cada aba).
