import type { AppData } from "@/types";

const FOTO_TAG_RE = /\(foto (\d+)\/(\d+)\)/i;

export function descricaoFichaCorrespondeFoto(
  descricao: string | undefined,
  fotoIdx: number,
  totalFotos: number
): boolean {
  if (!descricao || totalFotos <= 0 || fotoIdx < 0) return false;
  const m = descricao.match(FOTO_TAG_RE);
  if (!m) return false;
  const idx = Number(m[1]) - 1;
  const tot = Number(m[2]);
  return idx === fotoIdx && tot === totalFotos;
}

/** Evita falso positivo de `includes("foto 1/")` em `(foto 10/3)`. */
export function fichaJaTemLancamentoFoto(
  fichas: AppData["fichaCorrida"],
  notaId: string,
  fotoIdx: number,
  totalFotos: number
): boolean {
  return fichas.some(
    (f) => f.notaPedidoId === notaId && descricaoFichaCorrespondeFoto(f.descricao, fotoIdx, totalFotos)
  );
}

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

/** Primeira foto ainda sem lançamento na ficha (multi-foto). */
export function encontrarPrimeiraFotoPendente(
  totalFotos: number,
  lancadas: ReadonlySet<number>
): number {
  if (totalFotos <= 0) return 0;
  for (let i = 0; i < totalFotos; i++) {
    if (!lancadas.has(i)) return i;
  }
  return totalFotos - 1;
}

/** Próxima foto pendente após `aposIdx`, ou null se só faltam as já lançadas. */
export function encontrarProximaFotoPendenteApos(
  aposIdx: number,
  totalFotos: number,
  lancadas: ReadonlySet<number>
): number | null {
  if (totalFotos <= 0) return null;
  for (let i = aposIdx + 1; i < totalFotos; i++) {
    if (!lancadas.has(i)) return i;
  }
  return null;
}
