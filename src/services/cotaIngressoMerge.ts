import type { ArquivoMensalCooperado } from "@/types";

type EstadoCota = Partial<Pick<ArquivoMensalCooperado, "cotaIngressoPaga" | "cotaIngressoUpdatedAt" | "updatedAt">>;
const time = (a: EstadoCota) => Date.parse(a.cotaIngressoUpdatedAt ?? a.updatedAt ?? "") || 0;

/** Só uma alteração explícita e posterior da cota pode desfazer a confirmação. */
export function mergeCotaIngressoState(a: EstadoCota, b: EstadoCota): Pick<EstadoCota, "cotaIngressoPaga" | "cotaIngressoUpdatedAt"> {
  const paid = [a, b].filter(x => x.cotaIngressoPaga === true).sort((x, y) => time(y) - time(x))[0];
  const unpaid = [a, b].filter(x => x.cotaIngressoPaga === false && !!x.cotaIngressoUpdatedAt).sort((x, y) => time(y) - time(x))[0];
  const winner = paid ? unpaid && time(unpaid) > time(paid) ? unpaid : paid : unpaid ?? (a.cotaIngressoPaga === false ? a : b);
  return { cotaIngressoPaga: winner.cotaIngressoPaga, cotaIngressoUpdatedAt: winner.cotaIngressoUpdatedAt ?? (winner.cotaIngressoPaga === true ? winner.updatedAt : undefined) };
}

/** Proteção também no servidor: um aparelho antigo não apaga cota confirmada por outro. */
export function preservarCotasIngresso(existing: ArquivoMensalCooperado[], incoming: ArquivoMensalCooperado[]): ArquivoMensalCooperado[] {
  const key = (a: ArquivoMensalCooperado) => JSON.stringify([a.cooperativaId, a.cooperadoId, a.mesReferencia]);
  const prev = new Map(existing.map(a => [key(a), a]));
  const next = incoming.map(a => {
    const old = prev.get(key(a));
    prev.delete(key(a));
    return old ? { ...a, ...mergeCotaIngressoState(old, a) } : a;
  });
  for (const a of prev.values()) {
    if (a.cotaIngressoPaga !== true) continue;
    next.push({ id: a.id, cooperativaId: a.cooperativaId, cooperadoId: a.cooperadoId, mesReferencia: a.mesReferencia, notaPedidoIds: [], pagamentoIds: [], updatedAt: a.updatedAt, ...mergeCotaIngressoState(a, {}) });
  }
  return next;
}
