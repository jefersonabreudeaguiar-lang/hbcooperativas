/**
 * HX 8.2.2 — rascunho de conferência só em memória (sessão do browser).
 * Não persiste em IDB/AppData; não altera regras de aprovação/lançamento.
 */

import type { NotaPedidoItem } from "@/types";

export type ConferenciaDraftItem = {
  produtoInstituicaoId: string;
  produtoNome: string;
  unidade: string;
  precoUnitario: number;
  quantidade: number;
};

export type ConferenciaDraftMemoria = {
  notaId: string;
  updatedAt: number;
  instId: string;
  local: string;
  descontoPct: number;
  cooperadoId: string;
  divisaoQtd: number;
  divisaoIds: string[];
  escolaAvulsa: string;
  numeroNotaManual: string;
  fotoIdx: number;
  itens: ConferenciaDraftItem[];
  fotosLancadas: number[];
  /** Índice de foto → itens já lançados na sequência multi-foto */
  lancamentosPorFoto: Record<number, NotaPedidoItem[]>;
};

const drafts = new Map<string, ConferenciaDraftMemoria>();

export function getConferenciaDraftMemoria(notaId: string): ConferenciaDraftMemoria | undefined {
  return drafts.get(notaId);
}

export function hasConferenciaDraftMemoria(notaId: string): boolean {
  return drafts.has(notaId);
}

export function setConferenciaDraftMemoria(draft: ConferenciaDraftMemoria): void {
  drafts.set(draft.notaId, { ...draft, updatedAt: Date.now() });
}

export function clearConferenciaDraftMemoria(notaId: string): void {
  drafts.delete(notaId);
}

export function clearAllConferenciaDraftMemoriaForTests(): void {
  drafts.clear();
}

export function serializarLancamentosPorFoto(
  map: Map<number, NotaPedidoItem[]>
): Record<number, NotaPedidoItem[]> {
  const out: Record<number, NotaPedidoItem[]> = {};
  for (const [idx, itens] of map.entries()) {
    out[idx] = itens;
  }
  return out;
}

export function restaurarLancamentosPorFoto(
  record: Record<number, NotaPedidoItem[]> | undefined
): Map<number, NotaPedidoItem[]> {
  const map = new Map<number, NotaPedidoItem[]>();
  if (!record) return map;
  for (const key of Object.keys(record)) {
    const idx = Number(key);
    if (!Number.isFinite(idx)) continue;
    map.set(idx, record[idx] ?? []);
  }
  return map;
}
