# Fase B — homolog RQL no browser

Medição **read-only** após login (cooperado ou responsável). Não altera dados.

## 1. Marcas de rota (L1 proxy)

1. Abra DevTools → **Console**.
2. Navegue: Dashboard → Notas → Ficha (ou Mensalidades).
3. Cole:

```javascript
performance.getEntriesByType("mark").filter((m) => m.name.startsWith("rql:route"))
```

Esperado: pares `rql:route:origem->destino` e `rql:route-paint:destino`.

Para tabela de latência paint (ms desde a transição):

```javascript
// carregar helper via build — em homolog use o snippet abaixo se o bundle exportar window
// ou inspecione manualmente: paint.startTime - transition.startTime
```

No código-fonte, `summarizeRqlRouteTimings()` em `@/lib/performance/rqlMarks` agrega transição → paint. Em homolog, importe temporariamente no console apenas se expuser debug; preferir **Performance** panel → **User timing**.

**SLO (doc HX 8.0):** troca de aba cooperado L1 p75 &lt; 200 ms — validar paintMs em dispositivo alvo.

## 2. Cold start cooperado (HX 9.0)

Filtro: `rql:cold:` em `performance.getEntriesByType("mark")` após cold open PWA.

## 3. Lighthouse (opcional, CI local)

Com app rodando (`npm run dev` ou URL de produção):

```bash
npx lighthouse https://hbcooperativas.vercel.app/dashboard --only-categories=performance --preset=desktop --output=json --output-path=./.lighthouse-dashboard.json
```

Repita para `/notas-pedido` logado (use Chrome profile autenticado ou PageSpeed em staging).

Priorize **LCP**, **INP**, **CLS** — compare com baseline anterior; Fase B não exige score mínimo fixo, só registro.

## 4. Gate automatizado (repo)

```bash
npx tsx scripts/test-rql-browser-instrumentation-h90.ts
npx tsx scripts/run-suite-perf-fluxos.ts
```
