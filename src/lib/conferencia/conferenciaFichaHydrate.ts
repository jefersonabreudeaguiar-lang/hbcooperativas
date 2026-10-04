import type { AppData } from "@/types";

const FOTO_TAG_RE = /\(foto (\d+)\/(\d+)\)/i;

/** Índices de fotos que já geraram linha na ficha (lançamento parcial multi-foto). */
export function inferirFotosLancadasNaFicha(
  data: AppData,
  notaId: string,
  totalFotos: number
): Set<number> {
  const out = new Set<number>();
  if (totalFotos <= 0) return out;

  for (const f of data.fichaCorrida) {
    if (f.notaPedidoId !== notaId) continue;
    const m = f.descricao?.match(FOTO_TAG_RE);
    if (m) {
      const idx = Number(m[1]) - 1;
      const tot = Number(m[2]);
      if (Number.isFinite(idx) && idx >= 0 && idx < totalFotos && tot === totalFotos) {
        out.add(idx);
      }
      continue;
    }
    if (totalFotos === 1) {
      out.add(0);
    }
  }
  return out;
}

export function conferenciaParcialPendenteFinalizacao(
  data: AppData,
  notaId: string,
  totalFotos: number
): { lancadas: number; total: number; todasLancadasNaFicha: boolean } {
  const lancadas = inferirFotosLancadasNaFicha(data, notaId, totalFotos).size;
  return {
    lancadas,
    total: totalFotos,
    todasLancadasNaFicha: totalFotos > 0 && lancadas >= totalFotos,
  };
}
