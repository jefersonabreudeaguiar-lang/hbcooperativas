import type { AppData, NotaPedido, NotaPedidoItem } from "@/types";
import { ordenarNotasMesCronologico } from "@/services/cooperadoEntregasService";
import { fichaPertenceCooperado } from "@/services/cooperadoCloudService";
import { getFotosExibicaoNota } from "@/utils/fotoEntrega";
import { formatMesReferencia } from "@/utils/format";
import { round2 } from "@/utils/calculations";

/** Uma entrega = um envio do cooperado (pode ter várias fotos). */
export interface EntregaCooperadoView {
  id: string;
  notas: NotaPedido[];
  fotos: string[];
  dataEntrega: string;
  mesReferencia: string;
  numeroNoMes: number;
  qtdFotos: number;
}

export interface SemanaEntregasMes {
  indice: number;
  rotulo: string;
  entregas: EntregaCooperadoView[];
}

function diaDoMes(dataEntrega: string): number {
  return parseInt(dataEntrega.split("-")[2], 10) || 1;
}

function indiceSemanaNoMes(dataEntrega: string): number {
  return Math.min(5, Math.ceil(diaDoMes(dataEntrega) / 7));
}

function rotuloSemana(indice: number, mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const inicio = (indice - 1) * 7 + 1;
  const fim = Math.min(indice * 7, diasNoMes);
  const mesLabel = formatMesReferencia(mesReferencia).replace(/\s+\d{4}$/, "");
  return `Semana ${indice} · ${String(inicio).padStart(2, "0")} a ${String(fim).padStart(2, "0")} de ${mesLabel}`;
}

function chaveAgrupamentoEntrega(nota: NotaPedido): string {
  const semana = indiceSemanaNoMes(nota.dataEntrega);
  return `${nota.mesReferencia}|${semana}|${nota.dataEntrega}`;
}

/** Agrupa notas pela mesma data de lançamento dentro da semana (vários envios no mesmo dia = 1 entrega). */
export function agruparNotasEmEntregas(notas: NotaPedido[]): EntregaCooperadoView[] {
  const sorted = ordenarNotasMesCronologico(notas);
  const grupos = new Map<string, EntregaCooperadoView>();

  for (const nota of sorted) {
    const chave = chaveAgrupamentoEntrega(nota);
    const fotos = getFotosExibicaoNota(nota);
    const existente = grupos.get(chave);

    if (existente) {
      existente.notas.push(nota);
      existente.fotos.push(...fotos);
      existente.qtdFotos = existente.fotos.length;
      continue;
    }

    grupos.set(chave, {
      id: nota.id,
      notas: [nota],
      fotos: [...fotos],
      dataEntrega: nota.dataEntrega,
      mesReferencia: nota.mesReferencia,
      numeroNoMes: 0,
      qtdFotos: fotos.length,
    });
  }

  return [...grupos.values()]
    .sort((a, b) => {
      const porData = a.dataEntrega.localeCompare(b.dataEntrega);
      if (porData !== 0) return porData;
      return (
        new Date(a.notas[0].createdAt).getTime() - new Date(b.notas[0].createdAt).getTime()
      );
    })
    .map((e, i) => ({ ...e, numeroNoMes: i + 1 }));
}

export function agruparEntregasPorSemanaNoMes(
  entregas: EntregaCooperadoView[],
  mesReferencia: string
): SemanaEntregasMes[] {
  const byWeek = new Map<number, EntregaCooperadoView[]>();

  for (const entrega of entregas) {
    const semana = indiceSemanaNoMes(entrega.dataEntrega);
    const list = byWeek.get(semana) ?? [];
    list.push(entrega);
    byWeek.set(semana, list);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([indice, lista]) => ({
      indice,
      rotulo: rotuloSemana(indice, mesReferencia),
      entregas: lista,
    }));
}

export function contarEntregasNoMes(notas: NotaPedido[]): number {
  return agruparNotasEmEntregas(notas).length;
}

export interface ValoresEntregaCooperado {
  valorBruto: number;
  valorDesconto: number;
  valorLiquido: number;
  temValorAprovado: boolean;
}

export function notasComValorEntrega(notas: NotaPedido[]): NotaPedido[] {
  return notas.filter((n) => n.status === "conferida" || n.status === "pago");
}

export function statusEntregaCooperado(entrega: EntregaCooperadoView): NotaPedido["status"] {
  const n = entrega.notas[0];
  if (entrega.notas.some((x) => x.status === "rejeitada")) return "rejeitada";
  if (entrega.notas.every((x) => x.status === "pago")) return "pago";
  if (entrega.notas.some((x) => x.status === "conferida")) return "conferida";
  return n.status;
}

/** Valores alinhados à ficha corrida (mesma base do total do mês). */
export function valoresEntregaCooperado(
  entrega: EntregaCooperadoView,
  data?: AppData,
  cooperadoId?: string
): ValoresEntregaCooperado {
  const aprovadas = notasComValorEntrega(entrega.notas);
  if (aprovadas.length === 0) {
    return { valorBruto: 0, valorDesconto: 0, valorLiquido: 0, temValorAprovado: false };
  }

  const cid = cooperadoId ?? aprovadas[0].cooperadoId;
  const ids = new Set(aprovadas.map((n) => n.id));

  if (data) {
    const fichas = data.fichaCorrida.filter(
      (f) => ids.has(f.notaPedidoId) && fichaPertenceCooperado(data, f, cid)
    );
    const fichaIds = new Set(fichas.map((f) => f.notaPedidoId));
    const semFicha = aprovadas.filter((n) => !fichaIds.has(n.id));

    if (fichas.length > 0 || semFicha.length > 0) {
      const valorBruto = round2(
        fichas.reduce((s, f) => s + f.valorBruto, 0) +
          semFicha.reduce((s, n) => s + n.valorBruto, 0)
      );
      const valorDesconto = round2(
        fichas.reduce((s, f) => s + f.descontos, 0) +
          semFicha.reduce((s, n) => s + n.valorDesconto, 0)
      );
      const valorLiquido = round2(
        fichas.reduce((s, f) => s + f.valorLiquido, 0) +
          semFicha.reduce((s, n) => s + n.valorLiquido, 0)
      );
      return { valorBruto, valorDesconto, valorLiquido, temValorAprovado: valorLiquido > 0 };
    }
  }

  return {
    valorBruto: round2(aprovadas.reduce((s, n) => s + n.valorBruto, 0)),
    valorDesconto: round2(aprovadas.reduce((s, n) => s + n.valorDesconto, 0)),
    valorLiquido: round2(aprovadas.reduce((s, n) => s + n.valorLiquido, 0)),
    temValorAprovado: true,
  };
}

/** Itens consolidados da entrega (mesma lógica do total bruto). */
export function itensConsolidadosEntrega(entrega: EntregaCooperadoView): NotaPedidoItem[] {
  const map = new Map<string, NotaPedidoItem>();

  for (const nota of notasComValorEntrega(entrega.notas)) {
    for (const item of nota.itens ?? []) {
      if (item.quantidade <= 0) continue;
      const existente = map.get(item.produtoInstituicaoId);
      if (existente) {
        existente.quantidade = round2(existente.quantidade + item.quantidade);
        existente.valorBruto = round2(existente.valorBruto + item.valorBruto);
      } else {
        map.set(item.produtoInstituicaoId, { ...item });
      }
    }
  }

  return [...map.values()].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
}
