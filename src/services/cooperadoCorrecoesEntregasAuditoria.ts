/**
 * Auditoria read-only — alinha valor visível ao cooperado com aba Correções (todos os cooperados).
 * Não altera lançamentos; serve para alertar gestão antes de inconsistências virarem “sumiu na tela”.
 */
import type { AppData } from "@/types";
import { listCooperadosDaCooperativa, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import {
  listarEntregasCorrecaoCooperado,
  statusCorrecaoEntregaCooperado,
  valorLiquidoEntregaCorrecaoExibicao,
  type MotivoBloqueioExclusaoEntrega,
} from "@/services/notaPedidoService";

export type AchadoCorrecaoEntrega = {
  cooperadoId: string;
  cooperadoNome: string;
  notaId: string;
  numeroNota: string;
  mesReferencia: string;
  valorExibicao: number;
  executavelApagar: boolean;
  executavelRelancar: boolean;
  bloqueioApagar?: MotivoBloqueioExclusaoEntrega;
};

export type ResumoAuditoriaCorrecoesCooperativa = {
  cooperadosComAchados: number;
  entregasVisiveisCorrecao: number;
  entregasBloqueadas: number;
  cooperadosComValorSemCorrecaoExecutavel: number;
  achados: AchadoCorrecaoEntrega[];
};

function pushAchadosCooperado(
  data: AppData,
  coopId: string,
  cooperadoId: string,
  cooperadoNome: string,
  out: AchadoCorrecaoEntrega[]
): { visiveis: number; bloqueadas: number; temValorBloqueado: boolean } {
  let visiveis = 0;
  let bloqueadas = 0;
  let temValorBloqueado = false;

  const vistos = new Set<string>();
  for (const acao of ["apagar", "relancar"] as const) {
    for (const nota of listarEntregasCorrecaoCooperado(data, cooperadoId, coopId, acao)) {
      if (vistos.has(nota.id)) continue;
      vistos.add(nota.id);
      const stApagar = statusCorrecaoEntregaCooperado(data, nota.id, coopId, "apagar");
      const stRel = statusCorrecaoEntregaCooperado(data, nota.id, coopId, "relancar");
      if (!stApagar.visivel && !stRel.visivel) continue;

      visiveis += 1;
      const valorExibicao = valorLiquidoEntregaCorrecaoExibicao(data, nota);
      const executavelApagar = stApagar.executavel;
      const executavelRelancar = stRel.executavel;
      if (!executavelApagar && !executavelRelancar) {
        bloqueadas += 1;
        if (valorExibicao > 0) temValorBloqueado = true;
      }

      out.push({
        cooperadoId,
        cooperadoNome,
        notaId: nota.id,
        numeroNota: nota.numeroNota,
        mesReferencia: nota.mesReferencia,
        valorExibicao,
        executavelApagar,
        executavelRelancar,
        bloqueioApagar: stApagar.executavel ? undefined : stApagar.reason,
      });
    }
  }

  return { visiveis, bloqueadas, temValorBloqueado };
}

/** Varredura cooperativa — cooperados ativos com entrega visível em Correções e possível bloqueio. */
export function auditarCorrecoesEntregasCooperativa(
  data: AppData,
  cooperativaId: string
): ResumoAuditoriaCorrecoesCooperativa {
  const achados: AchadoCorrecaoEntrega[] = [];
  let entregasVisiveisCorrecao = 0;
  let entregasBloqueadas = 0;
  let cooperadosComValorSemCorrecaoExecutavel = 0;
  const cooperadosComAchados = new Set<string>();

  for (const c of listCooperadosDaCooperativa(data, cooperativaId)) {
    if (c.status !== "ativo") continue;
    const canon = resolverCooperadoIdCanonico(data, c.id, cooperativaId);
    const totalAberto = getTotalAPagarCooperado(data, canon, undefined, cooperativaId);
    const antes = achados.length;
    const stats = pushAchadosCooperado(data, cooperativaId, canon, c.nomeCompleto, achados);
    entregasVisiveisCorrecao += stats.visiveis;
    entregasBloqueadas += stats.bloqueadas;

    if (achados.length > antes) cooperadosComAchados.add(canon);
    if (stats.temValorBloqueado || (totalAberto > 0 && stats.bloqueadas > 0)) {
      cooperadosComValorSemCorrecaoExecutavel += 1;
    }
  }

  return {
    cooperadosComAchados: cooperadosComAchados.size,
    entregasVisiveisCorrecao,
    entregasBloqueadas,
    cooperadosComValorSemCorrecaoExecutavel,
    achados,
  };
}
