import type { AppData, Reclamacao } from "@/types";
import { getCooperadoNome } from "@/utils/calculations";

export interface ReclamacaoLinha {
  id: string;
  data: string;
  item: string;
  cooperadoId: string;
  cooperadoNome: string;
  descricao: string;
  registradoPorNome?: string;
}

export interface ReclamacaoPorCooperado {
  cooperadoId: string;
  cooperadoNome: string;
  quantidade: number;
  percentual: number;
}

export interface RelatorioReclamacoes {
  total: number;
  historico: ReclamacaoLinha[];
  porCooperado: ReclamacaoPorCooperado[];
}

export function listarReclamacoesCooperativa(
  data: AppData,
  cooperativaId?: string,
  cooperadoId?: string
): ReclamacaoLinha[] {
  let items = data.reclamacoes ?? [];
  if (cooperativaId) {
    items = items.filter((r) => r.cooperativaId === cooperativaId);
  }
  if (cooperadoId) {
    items = items.filter((r) => r.cooperadoId === cooperadoId);
  }
  return items
    .map((r) => ({
      id: r.id,
      data: r.data,
      item: r.item,
      cooperadoId: r.cooperadoId,
      cooperadoNome: getCooperadoNome(data.cooperados, r.cooperadoId),
      descricao: r.descricao,
      registradoPorNome: r.registradoPorNome,
    }))
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
}

export function getRelatorioReclamacoes(
  data: AppData,
  cooperativaId?: string,
  cooperadoId?: string
): RelatorioReclamacoes {
  const historico = listarReclamacoesCooperativa(data, cooperativaId, cooperadoId);
  const total = historico.length;

  const contagem = new Map<string, number>();
  for (const linha of historico) {
    contagem.set(linha.cooperadoId, (contagem.get(linha.cooperadoId) ?? 0) + 1);
  }

  const porCooperado: ReclamacaoPorCooperado[] = [...contagem.entries()]
    .map(([id, quantidade]) => ({
      cooperadoId: id,
      cooperadoNome: getCooperadoNome(data.cooperados, id),
      quantidade,
      percentual: total > 0 ? Math.round((quantidade / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.cooperadoNome.localeCompare(b.cooperadoNome, "pt-BR"));

  const somaPct = porCooperado.reduce((s, p) => s + p.percentual, 0);
  if (porCooperado.length > 0 && somaPct !== 100 && total > 0) {
    const diff = Math.round((100 - somaPct) * 10) / 10;
    porCooperado[0].percentual = Math.round((porCooperado[0].percentual + diff) * 10) / 10;
  }

  return { total, historico, porCooperado };
}

export function criarReclamacao(
  data: AppData,
  payload: Omit<Reclamacao, "id" | "createdAt" | "updatedAt">
): AppData {
  const now = new Date().toISOString();
  const reclamacao: Reclamacao = {
    ...payload,
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...data,
    reclamacoes: [...(data.reclamacoes ?? []), reclamacao],
  };
}

export function removerReclamacao(data: AppData, id: string): AppData {
  return {
    ...data,
    reclamacoes: (data.reclamacoes ?? []).filter((r) => r.id !== id),
  };
}
