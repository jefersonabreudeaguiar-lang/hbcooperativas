/* Diagnóstico local: recebe AppData do próprio navegador e retorna somente tempo e validade do JSON. */
self.onmessage = function (event) {
  var startedAt = performance.now();
  try {
    JSON.parse(event.data);
    self.postMessage({ ok: true, ms: Math.round((performance.now() - startedAt) * 100) / 100 });
  } catch (error) {
    self.postMessage({ ok: false, error: String((error && error.name) || "parse_error") });
  }
};
