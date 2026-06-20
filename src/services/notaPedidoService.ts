import type {
  AppData,
  NotaPedido,
  NotaPedidoItem,
  FichaCorrida,
  FichaCorridaDesconto,
  PagamentoCooperadoRegistro,
  ArquivoMensalCooperado,
  Comunicado,
} from "@/types";
import { round2 } from "@/utils/calculations";
import { gerarReciboHtml } from "@/utils/recibo";

export function calcularItensNota(
  itens: NotaPedidoItem[],
  percentualDesconto: number
): { itens: NotaPedidoItem[]; valorBruto: number; valorDesconto: number; valorLiquido: number } {
  const calculados = itens
    .filter((i) => i.quantidade > 0)
    .map((i) => ({
      ...i,
      valorBruto: round2(i.quantidade * i.precoUnitario),
    }));

  const valorBruto = round2(calculados.reduce((s, i) => s + i.valorBruto, 0));
  const valorDesconto = round2(valorBruto * (percentualDesconto / 100));
  const valorLiquido = round2(valorBruto - valorDesconto);

  return { itens: calculados, valorBruto, valorDesconto, valorLiquido };
}

export function gerarNumeroNota(data: AppData, cooperativaId: string): string {
  const count = data.notasPedido.filter((n) => n.cooperativaId === cooperativaId).length + 1;
  const ano = new Date().getFullYear();
  return `${ano}-${String(count).padStart(4, "0")}`;
}

export function getSaldoAnteriorFicha(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  excludeNotaId?: string
): number {
  const entries = data.fichaCorrida
    .filter((f) => f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia && f.notaPedidoId !== excludeNotaId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return entries.length ? entries[entries.length - 1].saldoAcumulado : 0;
}

export function getMensalidadesPendentesMes(data: AppData, cooperadoId: string, mesReferencia: string): FichaCorridaDesconto[] {
  return data.mensalidades
    .filter(
      (m) =>
        m.cooperadoId === cooperadoId &&
        m.mesReferencia === mesReferencia &&
        (m.status === "pendente" || m.status === "atrasada")
    )
    .map((m) => ({
      tipo: "mensalidade" as const,
      motivo: `Mensalidade ${mesReferencia}`,
      valor: m.valor,
    }));
}

export function upsertArquivoMensal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesReferencia: string,
  patch: Partial<
    Pick<
      ArquivoMensalCooperado,
      "notaPedidoIds" | "pagamentoIds" | "mensalidadeFixa" | "descontoAvulso" | "descontoAvulsoMotivo" | "cotaIngressoPaga"
    >
  >
): ArquivoMensalCooperado[] {
  const now = new Date().toISOString();
  const idx = data.arquivosMensais.findIndex(
    (a) => a.cooperadoId === cooperadoId && a.mesReferencia === mesReferencia
  );
  if (idx < 0) {
    const novo: ArquivoMensalCooperado = {
      id: `am_${Date.now()}`,
      cooperativaId,
      cooperadoId,
      mesReferencia,
      notaPedidoIds: patch.notaPedidoIds ?? [],
      pagamentoIds: patch.pagamentoIds ?? [],
      mensalidadeFixa: patch.mensalidadeFixa,
      descontoAvulso: patch.descontoAvulso,
      descontoAvulsoMotivo: patch.descontoAvulsoMotivo,
      cotaIngressoPaga: patch.cotaIngressoPaga,
      updatedAt: now,
    };
    return [...data.arquivosMensais, novo];
  }
  const cur = data.arquivosMensais[idx];
  const merged: ArquivoMensalCooperado = {
    ...cur,
    notaPedidoIds: patch.notaPedidoIds
      ? [...new Set([...cur.notaPedidoIds, ...patch.notaPedidoIds])]
      : cur.notaPedidoIds,
    pagamentoIds: patch.pagamentoIds
      ? [...new Set([...cur.pagamentoIds, ...patch.pagamentoIds])]
      : cur.pagamentoIds,
    mensalidadeFixa: patch.mensalidadeFixa !== undefined ? patch.mensalidadeFixa : cur.mensalidadeFixa,
    descontoAvulso: patch.descontoAvulso !== undefined ? patch.descontoAvulso : cur.descontoAvulso,
    descontoAvulsoMotivo: patch.descontoAvulsoMotivo !== undefined ? patch.descontoAvulsoMotivo : cur.descontoAvulsoMotivo,
    cotaIngressoPaga: patch.cotaIngressoPaga !== undefined ? patch.cotaIngressoPaga : cur.cotaIngressoPaga,
    updatedAt: now,
  };
  const next = [...data.arquivosMensais];
  next[idx] = merged;
  return next;
}

export function getArquivoMensalCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): ArquivoMensalCooperado | undefined {
  return data.arquivosMensais.find((a) => a.cooperadoId === cooperadoId && a.mesReferencia === mesReferencia);
}

export function getMensalidadeFixaMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): number {
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia);
  if (arquivo?.mensalidadeFixa != null && arquivo.mensalidadeFixa >= 0) {
    return arquivo.mensalidadeFixa;
  }
  const pendente = data.mensalidades.find(
    (m) =>
      m.cooperadoId === cooperadoId &&
      m.mesReferencia === mesReferencia &&
      (m.status === "pendente" || m.status === "atrasada")
  );
  if (pendente) return pendente.valor;
  const coop = cooperativaId
    ? data.cooperativas.find((c) => c.id === cooperativaId)
    : data.cooperados.find((c) => c.id === cooperadoId)
      ? data.cooperativas.find((c) => c.id === data.cooperados.find((x) => x.id === cooperadoId)!.cooperativaId)
      : undefined;
  return coop?.mensalidadeConfig?.valorPadrao ?? 0;
}

export type StatusCotaCooperado = "paga" | "nao_paga" | "sem_cota";

export function getStatusCotaCooperado(data: AppData, cooperadoId: string, mesReferencia: string): StatusCotaCooperado {
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia);
  if (arquivo?.cotaIngressoPaga) return "paga";

  const cotas = data.cotas.filter((c) => c.cooperadoId === cooperadoId);
  if (cotas.length === 0) return "nao_paga";
  if (cotas.every((c) => c.status === "quitada")) return "paga";
  return "nao_paga";
}

export function buildFichaFromNota(
  nota: NotaPedido,
  data: AppData,
  responsavel: string,
  cooperadoNome?: string
): FichaCorrida {
  const saldoAnterior = getSaldoAnteriorFicha(data, nota.cooperadoId, nota.mesReferencia, nota.id);
  const inst = data.instituicoes.find((i) => i.id === nota.instituicaoId);
  const escola = nota.escolaAvulsaNome?.trim() || inst?.nome || "Instituição";
  const descontosDetalhe: FichaCorridaDesconto[] = [];
  if (nota.valorDesconto > 0) {
    descontosDetalhe.push({
      tipo: "cooperativa",
      motivo: `Taxa cooperativa (${nota.percentualDescontoCooperativa}%)`,
      valor: nota.valorDesconto,
    });
  }
  return {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    cooperativaId: nota.cooperativaId,
    cooperadoId: nota.cooperadoId,
    cooperadoNomeSnapshot:
      cooperadoNome?.trim() ||
      nota.cooperadoNomeSnapshot?.trim() ||
      data.cooperados.find((c) => c.id === nota.cooperadoId)?.nomeCompleto,
    notaPedidoId: nota.id,
    descricao: `Nota ${nota.numeroNota} — ${escola}`,
    valorBruto: nota.valorBruto,
    descontos: nota.valorDesconto,
    valorLiquido: nota.valorLiquido,
    saldoAcumulado: round2(saldoAnterior + nota.valorLiquido),
    mesReferencia: nota.mesReferencia,
    status: "pendente",
    dataLancamento: new Date().toISOString().split("T")[0],
    dataPagamentoPrevista: getUltimoDiaMes(nota.mesReferencia),
    responsavelConferencia: responsavel,
    itens: nota.itens,
    percentualDescontoCooperativa: nota.percentualDescontoCooperativa,
    descontosDetalhe,
    createdAt: new Date().toISOString(),
  };
}

function getUltimoDiaMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-");
  const lastDay = new Date(parseInt(ano), parseInt(mes), 0).getDate();
  return `${mesReferencia}-${String(lastDay).padStart(2, "0")}`;
}

export function getTotalAPagarCooperado(data: AppData, cooperadoId: string, mesReferencia?: string): number {
  const entries = data.fichaCorrida.filter((f) => {
    if (f.cooperadoId !== cooperadoId || f.status !== "pendente") return false;
    if (mesReferencia && f.mesReferencia !== mesReferencia) return false;
    return true;
  });
  return round2(entries.reduce((s, f) => s + f.valorLiquido, 0));
}

export function getResumoPagamentoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): {
  valorBruto: number;
  descontoCooperativa: number;
  descontosExtras: FichaCorridaDesconto[];
  valorEntregas: number;
  valorLiquido: number;
  fichaIds: string[];
  notaPedidoIds: string[];
} {
  const fichas = data.fichaCorrida.filter(
    (f) => f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia && f.status === "pendente"
  );
  const valorBruto = round2(fichas.reduce((s, f) => s + f.valorBruto, 0));
  const descontoCooperativa = round2(fichas.reduce((s, f) => s + f.descontos, 0));
  const valorEntregas = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
  const coop = data.cooperados.find((c) => c.id === cooperadoId);
  const coopId = coop?.cooperativaId ?? fichas[0]?.cooperativaId;
  const mensalidadeFixa = getMensalidadeFixaMes(data, cooperadoId, mesReferencia, coopId);
  const arquivo = getArquivoMensalCooperado(data, cooperadoId, mesReferencia);
  const descontosExtras: FichaCorridaDesconto[] = [];
  if (mensalidadeFixa > 0) {
    descontosExtras.push({
      tipo: "mensalidade",
      motivo: `Mensalidade ${mesReferencia}`,
      valor: mensalidadeFixa,
    });
  }
  if (arquivo?.descontoAvulso && arquivo.descontoAvulso > 0) {
    descontosExtras.push({
      tipo: "manual",
      motivo: arquivo.descontoAvulsoMotivo?.trim() || "Desconto avulso",
      valor: arquivo.descontoAvulso,
    });
  }
  const totalExtras = round2(descontosExtras.reduce((s, d) => s + d.valor, 0));
  const valorLiquido = round2(Math.max(0, valorEntregas - totalExtras));
  return {
    valorBruto,
    descontoCooperativa,
    descontosExtras,
    valorEntregas,
    valorLiquido,
    fichaIds: fichas.map((f) => f.id),
    notaPedidoIds: fichas.map((f) => f.notaPedidoId),
  };
}

export function getTotalRecebidoCooperado(data: AppData, cooperadoId: string, mesReferencia?: string): number {
  const entries = data.fichaCorrida.filter((f) => {
    if (f.cooperadoId !== cooperadoId || f.status !== "pago") return false;
    if (mesReferencia && f.mesReferencia !== mesReferencia) return false;
    return true;
  });
  return round2(entries.reduce((s, f) => s + f.valorLiquido, 0));
}

export function getPagamentoAguardandoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string
): PagamentoCooperadoRegistro | undefined {
  return data.pagamentosCooperado.find(
    (p) =>
      p.cooperadoId === cooperadoId &&
      p.status === "aguardando_confirmacao" &&
      (!mesReferencia || p.mesReferencia === mesReferencia)
  );
}

export function aplicarItensNaNota(
  nota: NotaPedido,
  itensForm: NotaPedidoItem[],
  percentualDesconto: number,
  extras?: Partial<NotaPedido>
): NotaPedido {
  const calc = calcularItensNota(itensForm, percentualDesconto);
  return {
    ...nota,
    ...extras,
    itens: calc.itens,
    valorBruto: calc.valorBruto,
    percentualDescontoCooperativa: percentualDesconto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    updatedAt: new Date().toISOString(),
  };
}

export function registrarPagamentoCooperado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  responsavel: string
): AppData {
  const resumo = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia);
  if (resumo.valorLiquido <= 0 || resumo.fichaIds.length === 0) return data;

  const now = new Date().toISOString();
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  const coopId = cooperado?.cooperativaId ?? "";

  const pagamento: PagamentoCooperadoRegistro = {
    id: `pg_${Date.now()}`,
    cooperativaId: coopId,
    cooperadoId,
    mesReferencia,
    valorBruto: resumo.valorBruto,
    descontoCooperativa: resumo.descontoCooperativa,
    descontosExtras: resumo.descontosExtras,
    valorLiquido: resumo.valorLiquido,
    fichaIds: resumo.fichaIds,
    notaPedidoIds: resumo.notaPedidoIds,
    status: "aguardando_confirmacao",
    pagoPor: responsavel,
    pagoEm: now,
    createdAt: now,
  };

  let next = marcarFichaComoPaga(data, cooperadoId, mesReferencia, responsavel);

  const comunicado: Comunicado = {
    id: `cm_${Date.now()}`,
    cooperativaId: coopId,
    cooperadoId,
    titulo: "Pagamento realizado",
    descricao: `A cooperativa registrou o pagamento de ${resumo.valorLiquido.toFixed(2).replace(".", ",")} referente a ${mesReferencia}. Toque em PAGO na ficha para confirmar e assinar o recibo.`,
    data: now.split("T")[0],
    responsavel,
    categoria: "financeiro",
    fixado: true,
    visivelParaTodos: false,
    ativo: true,
    createdAt: now,
  };

  next = {
    ...next,
    pagamentosCooperado: [...next.pagamentosCooperado, pagamento],
    comunicados: [...next.comunicados, comunicado],
    arquivosMensais: upsertArquivoMensal(next, cooperadoId, coopId, mesReferencia, {
      notaPedidoIds: resumo.notaPedidoIds,
    }),
  };

  return next;
}

export function confirmarPagamentoCooperado(
  data: AppData,
  pagamentoId: string,
  assinaturaDataUrl: string
): AppData {
  const pagamento = data.pagamentosCooperado.find((p) => p.id === pagamentoId);
  if (!pagamento || pagamento.status !== "aguardando_confirmacao") return data;

  const cooperado = data.cooperados.find((c) => c.id === pagamento.cooperadoId);
  if (!cooperado) return data;

  const now = new Date().toISOString();
  const draft = {
    ...pagamento,
    assinaturaCooperado: assinaturaDataUrl,
    assinadoEm: now,
    status: "confirmado" as const,
  };
  const reciboHtml = gerarReciboHtml(
    data,
    draft,
    cooperado,
    data.cooperativas.find((c) => c.id === pagamento.cooperativaId)?.nome ?? "Cooperativa"
  );

  const pagamentosCooperado = data.pagamentosCooperado.map((p) =>
    p.id === pagamentoId
      ? { ...draft, reciboHtml, status: "confirmado" as const }
      : p
  );

  return {
    ...data,
    pagamentosCooperado,
    arquivosMensais: upsertArquivoMensal(data, pagamento.cooperadoId, pagamento.cooperativaId, pagamento.mesReferencia, {
      pagamentoIds: [pagamentoId],
    }),
  };
}

export function marcarFichaComoPaga(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  _responsavel: string
): AppData {
  const now = new Date().toISOString();
  const fichaAtualizada = data.fichaCorrida.map((f) =>
    f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia && f.status === "pendente"
      ? { ...f, status: "pago" as const }
      : f
  );
  const notaIds = fichaAtualizada
    .filter((f) => f.cooperadoId === cooperadoId && f.mesReferencia === mesReferencia && f.status === "pago")
    .map((f) => f.notaPedidoId);
  const notasPedido = data.notasPedido.map((n) =>
    notaIds.includes(n.id) && (n.status === "conferida" || n.status === "pago")
      ? { ...n, status: "pago" as const, updatedAt: now }
      : n
  );
  return { ...data, fichaCorrida: fichaAtualizada, notasPedido };
}
