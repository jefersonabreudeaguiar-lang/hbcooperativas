/**
 * Cole no console (logado) após navegar rotas — não altera dados.
 * Requer NEXT_PUBLIC_RQL_PERF_DEBUG=1 no build ou data-rql-perf-debug="1".
 */
(function () {
  if (typeof window.__hbRqlPerf?.print === "function") {
    return window.__hbRqlPerf.print();
  }
  const marks = performance.getEntriesByType("mark").filter((m) => m.name.startsWith("rql:"));
  console.table(marks.map((m) => ({ name: m.name, startTime: Math.round(m.startTime) })));
  console.info("Para relatório completo: ligue NEXT_PUBLIC_RQL_PERF_DEBUG=1 e use window.__hbRqlPerf.print()");
  return marks;
})();
