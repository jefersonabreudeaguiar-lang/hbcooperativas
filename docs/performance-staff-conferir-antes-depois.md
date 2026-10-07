# Responsável — Conferir entregas (antes / depois build 187)

Medição **só performance** no celular (Chrome DevTools remoto ou Safari Web Inspector). Não altera fluxo de conferência.

## Pré-requisitos

- Homolog com `NEXT_PUBLIC_RQL_PERF_DEBUG=1`
- Conta **responsável** com fila de conferência (≥1 cooperado pendente)
- Comparar **build 186** (antes) vs **187** (depois) no mesmo aparelho

## Roteiro (repetir 3× e usar a mediana)

### A — Abrir aba Notas

1. Fechar o PWA, abrir de novo, login responsável.
2. Toque **Notas / Entregas** no rodapé.
3. Marque o tempo até a **fila ou mensagem “sem pendências”** aparecer (não tela branca).

**Depois (187):** deve aparecer primeiro o skeleton cinza (`RouteChunkLoadingShell`), depois a fila — menos flash branco.

### B — Entrar na fila Conferir

1. Na vista fila, toque um **cooperado** com pendências.
2. Marque o tempo até a lista de notas/fotos responder ao toque.

### C — Abrir Conferir (crítico)

1. Passe o dedo na fila (hover aquece chunks no 187).
2. Toque **Conferir** em uma nota.
3. Marque:
   - **T1:** modal visível (overlay)
   - **T2:** foto da nota visível
   - **T3:** tabela de itens interativa

No console após o teste:

```js
window.__hbRqlPerf.print();
```

Procure marcas `staff_conferir_modal_open`, `staff-tab-switch`, transições `notas-pedido`.

### D — Comparativo WhatsApp (referência UX)

```js
window.__hbRqlPerf.printWhatsappCompare();
```

Anote `hbCoopAverageScore` e paint p75 na aba Notas.

## O que mudou no 187 (itens 1 + 3)

| Item | Efeito esperado |
|------|-----------------|
| **3** Loading Notas | Skeleton `gray-50` em cooperado e responsável ao carregar rota |
| **1** Split bundle | Entry leve + chunk `NotasPedidoStaffResponsavelApp`; chunk cooperado legado separado; preload do chunk **Conferir** no hover/prefetch |

## Metas internas (fase 2)

- T1 modal: &lt; 300 ms após toque (com prefetch)
- T2 foto: &lt; 1,5 s em 4G (rede dependente)
- Paint p75 troca aba Notas: tendência a &lt; 200 ms

Envie mediana de A/B/C (segundos ou “rápido / médio / lento”) para calibrar próximo passo (modal em chunk dedicado).
