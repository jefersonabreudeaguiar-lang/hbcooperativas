/**
 * Etapa 4 P3 — smoke ordem fila: aprovar e rejeitar compartilham FIFO e avanço otimista.
 */
import assert from "node:assert/strict";

export function conferenciaFilaDecisaoUsaAvancoOtimista(notasPedidoContentSrc: string): void {
  const aprovarIdx = notasPedidoContentSrc.indexOf("scheduleConferenciaAprovacaoNuvemSync({");
  assert.ok(aprovarIdx >= 0, "aprovação agenda sync nuvem");
  const aprovarBlock = notasPedidoContentSrc.slice(Math.max(0, aprovarIdx - 400), aprovarIdx + 3500);
  assert.ok(
    aprovarBlock.includes("prepararConferenciaNota(proxima") &&
      !aprovarBlock.includes("await patchNotaPedidoInCloud"),
    "aprovação avança fila sem await sync"
  );

  const rejeitarIdx = notasPedidoContentSrc.indexOf("scheduleConferenciaRejeicaoNuvemSync({");
  assert.ok(rejeitarIdx >= 0, "rejeição agenda sync nuvem");
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
