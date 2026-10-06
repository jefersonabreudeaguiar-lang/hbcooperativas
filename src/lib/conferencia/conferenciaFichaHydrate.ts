import type { AppData, NotaPedidoItem } from "@/types";

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

/** Itens já lançados na ficha por índice de foto (0-based). */
export function extrairLancamentosPorFotoDaFicha(
  data: AppData,
  notaId: string,
  totalFotos: number
): Map<number, NotaPedidoItem[]> {
  const map = new Map<number, NotaPedidoItem[]>();
  if (totalFotos <= 0) return map;
  for (const f of data.fichaCorrida) {
    if (f.notaPedidoId !== notaId) continue;
    const m = f.descricao?.match(FOTO_TAG_RE);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    const tot = Number(m[2]);
    if (idx < 0 || idx >= totalFotos || tot !== totalFotos) continue;
    if (f.itens?.length) map.set(idx, f.itens);
  }
  return map;
}

/** Ficha é a fonte da verdade ao retomar conferência multi-foto. */
export function reidratarProgressoMultiFotoConferencia(
  data: AppData,
  notaId: string,
  totalFotos: number
): {
  lancadas: Set<number>;
  lancamentosPorFoto: Map<number, NotaPedidoItem[]>;
} {
  const lancadas = inferirFotosLancadasNaFicha(data, notaId, totalFotos);
  const lancamentosPorFoto = extrairLancamentosPorFotoDaFicha(data, notaId, totalFotos);
  return { lancadas, lancamentosPorFoto };
}

export function lancamentosOrdenadosPorFoto(
  map: ReadonlyMap<number, NotaPedidoItem[]>,
  totalFotos: number
): NotaPedidoItem[][] {
  return Array.from({ length: totalFotos }, (_, i) => map.get(i) ?? []);
}

/** Une progresso já gravado na ficha com índices ainda só na sessão (draft/refs). */
export function mesclarProgressoMultiFotoSessaoNaFicha(
  lancadasFicha: ReadonlySet<number>,
  lancamentosFicha: ReadonlyMap<number, NotaPedidoItem[]>,
  lancadasSessao: ReadonlySet<number>,
  lancamentosSessao: ReadonlyMap<number, NotaPedidoItem[]>
): { lancadas: Set<number>; lancamentosPorFoto: Map<number, NotaPedidoItem[]> } {
  const lancadas = new Set(lancadasFicha);
  const lancamentosPorFoto = new Map(lancamentosFicha);
  for (const idx of lancadasSessao) {
    if (lancadas.has(idx)) continue;
    lancadas.add(idx);
    const itens = lancamentosSessao.get(idx);
    if (itens?.length) lancamentosPorFoto.set(idx, itens);
  }
  return { lancadas, lancamentosPorFoto };
}

export function validarTodasFotosLancadasConferencia(
  lancadas: ReadonlySet<number>,
  totalFotos: number
): { ok: true } | { ok: false; primeiraPendente: number } {
  if (totalFotos <= 1) return { ok: true };
  for (let i = 0; i < totalFotos; i++) {
    if (!lancadas.has(i)) return { ok: false, primeiraPendente: i };
  }
  return { ok: true };
}
