import type { NotaPedido } from "@/types";
import { ordenarNotasMesCronologico } from "@/services/cooperadoEntregasService";
import { getFotosExibicaoNota } from "@/utils/fotoEntrega";
import { formatMesReferencia } from "@/utils/format";

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

/** Agrupa notas antigas (1 foto = 1 nota) pelo mesmo horário de envio. */
export function agruparNotasEmEntregas(notas: NotaPedido[]): EntregaCooperadoView[] {
  const sorted = ordenarNotasMesCronologico(notas);
  const entregas: EntregaCooperadoView[] = [];

  for (const nota of sorted) {
    const fotos = getFotosExibicaoNota(nota);
    const usaLote = (nota.fotosPedido?.length ?? 0) > 0;

    if (usaLote) {
      entregas.push({
        id: nota.id,
        notas: [nota],
        fotos,
        dataEntrega: nota.dataEntrega,
        mesReferencia: nota.mesReferencia,
        numeroNoMes: 0,
        qtdFotos: fotos.length,
      });
      continue;
    }

    const ultima = entregas[entregas.length - 1];
    const mesmoEnvio =
      ultima &&
      ultima.notas.length > 0 &&
      !(ultima.notas[0].fotosPedido?.length ?? 0) &&
      ultima.notas[0].createdAt === nota.createdAt;

    if (mesmoEnvio) {
      ultima.notas.push(nota);
      ultima.fotos.push(...fotos);
      ultima.qtdFotos = ultima.fotos.length;
    } else {
      entregas.push({
        id: nota.id,
        notas: [nota],
        fotos,
        dataEntrega: nota.dataEntrega,
        mesReferencia: nota.mesReferencia,
        numeroNoMes: 0,
        qtdFotos: fotos.length,
      });
    }
  }

  return entregas.map((e, i) => ({ ...e, numeroNoMes: i + 1 }));
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
