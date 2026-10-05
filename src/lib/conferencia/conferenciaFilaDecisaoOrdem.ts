/**
 * Etapa 4 P3 — smoke ordem fila: aprovar e rejeitar compartilham FIFO e avanço otimista.
 */
import assert from "node:assert/strict";

export function conferenciaFilaDecisaoUsaAvancoOtimista(notasPedidoContentSrc: string): void {
  const aprovarIdx = notasPedidoContentSrc.indexOf("enqueueConferenciaAprovacaoSync(notaId");
  assert.ok(aprovarIdx >= 0, "aprovação enfileira sync");
  const aprovarBlock = notasPedidoContentSrc.slice(aprovarIdx, aprovarIdx + 4000);
  assert.ok(
    aprovarBlock.includes("void (async () => {") && aprovarBlock.includes("prepararConferenciaNota(proxima"),
    "aprovação avança fila sem await sync"
  );

  const rejeitarIdx = notasPedidoContentSrc.indexOf("enqueueConferenciaRejeicaoSync(notaId");
  assert.ok(rejeitarIdx >= 0, "rejeição enfileira sync");
  const rejeitarBlock = notasPedidoContentSrc.slice(rejeitarIdx, rejeitarIdx + 2200);
  assert.ok(
    rejeitarBlock.includes("prepararConferenciaNota(proxima") &&
      !rejeitarBlock.includes("await patchNotaPedidoInCloud"),
    "rejeição avança fila sem await PATCH inline"
  );

  assert.ok(
    aprovarIdx < rejeitarIdx,
    "ordem no arquivo: aprovar antes de rejeitar (referência fila mista)"
  );
}
