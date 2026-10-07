# Fase 1 — Provar desempenho nas rotas reais (read-only)

**Escopo:** medição cooperado + responsável. **Não** altera fichas, lançamentos, sync, HB nem dados.

## Cooperado (5 abas)

1. Login → percorrer: Início → Entregas → Preços → Ficha → Mensalidades (2× cada sentido).
2. DevTools → marcas `rql:route:*` e `rql:route-paint:*`.
3. SLO L1 (doc 8.0): **paint p75 &lt; 200 ms** entre abas.

## Responsável (Notas / Conferir)

1. `/notas-pedido`: Fila → Cooperado → Histórico → Fila.
2. Abrir **Conferir** → **Lançar** uma foto → fechar modal.
3. Marcas esperadas:
   - `rql:staff-notas:fila->cooperado` (etc.)
   - `rql:interaction:staff_conferir_modal_open`
   - `rql:interaction:staff_conferir_lancamento_foto_start`

## Relatório rápido (homolog)

Build com `NEXT_PUBLIC_RQL_PERF_DEBUG=1` ou `data-rql-perf-debug="1"` no `<html>`.

Console:

```javascript
window.__hbRqlPerf.print()
```

Ou sem flag (marcas manuais):

```javascript
performance.getEntriesByType("mark").filter((m) => m.name.startsWith("rql:"))
```

## Gate repo

```bash
npx tsx scripts/test-rql-fase-1-prova-rotas.ts
```
