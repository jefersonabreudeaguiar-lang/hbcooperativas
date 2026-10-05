import { notaBloqueadaConferenciaPorExclusaoPendente } from "@/lib/conferencia/conferenciaAbrirGuard";

export type ConferenciaAcaoFinalGuardOpts = {
  syncingForUi: boolean;
  pendingDeleteIds: ReadonlySet<string> | undefined;
  notaId: string;
};

export function bloquearAcaoFinalConferencia(
  opts: ConferenciaAcaoFinalGuardOpts
): { blocked: false } | { blocked: true; mensagem: string } {
  if (notaBloqueadaConferenciaPorExclusaoPendente(opts.notaId, opts.pendingDeleteIds)) {
    return {
      blocked: true,
      mensagem: "Esta entrega está sendo excluída. Aguarde a sincronização antes de concluir.",
    };
  }
  if (opts.syncingForUi) {
    return {
      blocked: true,
      mensagem: "Aguarde a sincronização terminar antes de aprovar ou rejeitar.",
    };
  }
  return { blocked: false };
}
