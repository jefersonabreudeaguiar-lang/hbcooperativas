import type { AppData } from "@/types";
import { notaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { prestacoesDoCooperado } from "@/services/prestacaoContasService";
import { formatCurrency, formatMesReferencia } from "@/utils/format";

export const DIAS_RESOLVIDO_INICIO = 3;

export type TipoResolvidoInicio =
  | "pagamento"
  | "mensalidade"
  | "entrega"
  | "avulso"
  | "prestacao";

export interface ItemResolvidoInicioCooperado {
  id: string;
  tipo: TipoResolvidoInicio;
  titulo: string;
  subtitulo: string;
  resolvidoEm: string;
  href?: string;
}

export function resolvidoAindaVisivelNoInicio(
  resolvidoEm: string | undefined,
  dias = DIAS_RESOLVIDO_INICIO
): boolean {
  if (!resolvidoEm) return false;
  const t = new Date(resolvidoEm).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < dias * 24 * 60 * 60 * 1000;
}

function pushItem(
  lista: ItemResolvidoInicioCooperado[],
  vistos: Set<string>,
  item: ItemResolvidoInicioCooperado
) {
  if (vistos.has(item.id)) return;
  if (!resolvidoAindaVisivelNoInicio(item.resolvidoEm)) return;
  vistos.add(item.id);
  lista.push(item);
}

/** Itens pagos/confirmados que permanecem no início como "Resolvido" por 3 dias. */
export function listarResolvidosInicioCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ItemResolvidoInicioCooperado[] {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const lista: ItemResolvidoInicioCooperado[] = [];
  const vistos = new Set<string>();

  const pertencePagamento = (pCoopId: string) =>
    pCoopId === cooperadoId ||
    pCoopId === canonico ||
    resolverCooperadoIdCanonico(data, pCoopId, coopId) === canonico;

  const mesesPagamentoConfirmadoExibido = new Set<string>();

  for (const p of data.pagamentosCooperado) {
    if (!pertencePagamento(p.cooperadoId) || p.status !== "confirmado") continue;
    if (mesesPagamentoConfirmadoExibido.has(p.mesReferencia)) continue;
    mesesPagamentoConfirmadoExibido.add(p.mesReferencia);
    const resolvidoEm = p.assinadoEm ?? p.updatedAt ?? p.pagoEm;
    pushItem(lista, vistos, {
      id: `pagamento_${p.id}`,
      tipo: "pagamento",
      titulo: "Recebimento confirmado",
      subtitulo: `${formatMesReferencia(p.mesReferencia)} · ${formatCurrency(p.valorLiquido)}`,
      resolvidoEm,
      href: "/ficha-corrida",
    });
  }

  for (const m of data.mensalidades.filter((x) => x.cooperadoId === cooperadoId || x.cooperadoId === canonico)) {
    if (m.status === "paga") {
      pushItem(lista, vistos, {
        id: `mensalidade_paga_${m.id}`,
        tipo: "mensalidade",
        titulo: "Mensalidade paga",
        subtitulo: `${formatMesReferencia(m.mesReferencia)} · ${formatCurrency(m.valor)}`,
        resolvidoEm: m.dataPagamento ?? m.updatedAt,
        href: "/mensalidades",
      });
    } else if (m.status === "aguardando_confirmacao") {
      pushItem(lista, vistos, {
        id: `mensalidade_info_${m.id}`,
        tipo: "mensalidade",
        titulo: "Pagamento de mensalidade informado",
        subtitulo: `${formatMesReferencia(m.mesReferencia)} · aguardando confirmação da cooperativa`,
        resolvidoEm: m.informadoPagamentoEm ?? m.updatedAt,
        href: "/mensalidades",
      });
    }
  }

  const mesesComPagamentoCooperado = new Set(
    data.pagamentosCooperado
      .filter((p) => pertencePagamento(p.cooperadoId))
      .map((p) => p.mesReferencia)
  );
  const mesesEntregaPagaExibida = new Set<string>();

  for (const n of data.notasPedido) {
    if (!notaPertenceCooperado(data, n, cooperadoId, coopId)) continue;
    if (n.status !== "conferida" && n.status !== "pago") continue;

    if (n.status === "pago") {
      // Mês já coberto por pagamento na ficha — evita "Entrega paga" duplicada com "Recebimento confirmado".
      if (mesesComPagamentoCooperado.has(n.mesReferencia)) continue;
      if (mesesEntregaPagaExibida.has(n.mesReferencia)) continue;
      mesesEntregaPagaExibida.add(n.mesReferencia);
      const resolvidoEm = n.dataConferencia ?? n.updatedAt;
      pushItem(lista, vistos, {
        id: `entrega_paga_mes_${n.mesReferencia}`,
        tipo: "entrega",
        titulo: "Entrega paga",
        subtitulo: formatMesReferencia(n.mesReferencia),
        resolvidoEm,
        href: "/notas-pedido",
      });
      continue;
    }

    const resolvidoEm = n.dataConferencia ?? n.updatedAt;
    pushItem(lista, vistos, {
      id: `entrega_${n.id}`,
      tipo: "entrega",
      titulo: "Entrega conferida",
      subtitulo: formatMesReferencia(n.mesReferencia),
      resolvidoEm,
      href: "/notas-pedido",
    });
  }

  for (const v of data.valoresAvulsosReceber ?? []) {
    if (v.cooperadoId !== cooperadoId && v.cooperadoId !== canonico) continue;
    if (coopId && v.cooperativaId !== coopId) continue;
    if (v.status !== "pago") continue;
    pushItem(lista, vistos, {
      id: `avulso_${v.id}`,
      tipo: "avulso",
      titulo: "Valor avulso recebido",
      subtitulo: `${v.motivo} · ${formatCurrency(v.valor)}`,
      resolvidoEm: v.dataPagamento ?? v.updatedAt,
      href: "/ficha-corrida",
    });
  }

  for (const p of prestacoesDoCooperado(data, cooperadoId, coopId)) {
    if (p.status !== "conferida") continue;
    pushItem(lista, vistos, {
      id: `prestacao_${p.id}`,
      tipo: "prestacao",
      titulo: "Prestação de contas conferida",
      subtitulo: `${p.historico} · ${formatCurrency(p.valorRepasse)}`,
      resolvidoEm: p.updatedAt ?? p.createdAt,
      href: "/prestacao-contas",
    });
  }

  return lista.sort(
    (a, b) => new Date(b.resolvidoEm).getTime() - new Date(a.resolvidoEm).getTime()
  );
}

export function diasRestantesResolvidoInicio(resolvidoEm: string): number {
  const t = new Date(resolvidoEm).getTime();
  if (Number.isNaN(t)) return 0;
  const restanteMs = DIAS_RESOLVIDO_INICIO * 24 * 60 * 60 * 1000 - (Date.now() - t);
  return Math.max(0, Math.ceil(restanteMs / (24 * 60 * 60 * 1000)));
}
