import type { AppData, ValorAvulsoReceber } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { round2 } from "@/utils/calculations";

/** Motivo fixo quando o cooperado dilui cashback HB no resumo “a receber”. */
export const CASHBACK_HB_CREDITO_MOTIVO_AVULSO = "Cashback HB Crédito";

export type NaturezaValorAvulso = "credito" | "debito";

export function naturezaValorAvulso(v: ValorAvulsoReceber): NaturezaValorAvulso {
  return v.natureza === "debito" ? "debito" : "credito";
}

export function temCashbackHbCreditoPendenteMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): boolean {
  return valoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, cooperativaId).some(
    (v) => v.motivo.trim() === CASHBACK_HB_CREDITO_MOTIVO_AVULSO
  );
}

function avulsoPertenceCooperado(
  data: AppData,
  avulso: ValorAvulsoReceber,
  cooperadoId: string,
  cooperativaId?: string
): boolean {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const alvo = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const dono = resolverCooperadoIdCanonico(data, avulso.cooperadoId, coopId ?? avulso.cooperativaId);
  return avulso.cooperadoId === cooperadoId || avulso.cooperadoId === alvo || dono === alvo;
}

export function valoresAvulsosDoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): ValorAvulsoReceber[] {
  return (data.valoresAvulsosReceber ?? [])
    .filter((v) => avulsoPertenceCooperado(data, v, cooperadoId, cooperativaId))
    .sort((a, b) => new Date(b.dataLancamento).getTime() - new Date(a.dataLancamento).getTime());
}

export function valoresAvulsosPendentesMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): ValorAvulsoReceber[] {
  return valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter(
    (v) => v.mesReferencia === mesReferencia && v.status === "pendente"
  );
}

/** No Pagar, o débito entra no mês da ficha em aberto — não no mês do calendário. */
export function mesReferenciaLancamentoAvulsoPagar(
  mesesPendentesPagamento: string[],
  mesAtivo: string
): string {
  if (mesesPendentesPagamento.length > 0) {
    return [...mesesPendentesPagamento].sort()[mesesPendentesPagamento.length - 1]!;
  }
  return mesAtivo;
}

/** Lastros/projeções não podem apagar avulso recém-lançado. */
export function unirValoresAvulsosReceber(
  base: ValorAvulsoReceber[] | undefined,
  extra: ValorAvulsoReceber[] | undefined
): ValorAvulsoReceber[] {
  const byId = new Map<string, ValorAvulsoReceber>();
  for (const v of base ?? []) {
    if (v?.id) byId.set(v.id, v);
  }
  for (const v of extra ?? []) {
    if (!v?.id) continue;
    const prev = byId.get(v.id);
    if (!prev || String(v.updatedAt ?? "") >= String(prev.updatedAt ?? "")) {
      byId.set(v.id, v);
    }
  }
  return [...byId.values()];
}

/**
 * Avulso pendente no mês da ficha, ou órfão (mês sem ficha em aberto) no último mês a pagar.
 * Sem isso o responsável lança no mês atual e o resumo da ficha anterior não desconta.
 */
export function valoresAvulsosPendentesParaMesPagamento(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  mesesFichaEmAberto: string[],
  cooperativaId?: string
): ValorAvulsoReceber[] {
  const doMes = valoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, cooperativaId);
  const alvo = mesesFichaEmAberto.length
    ? [...mesesFichaEmAberto].sort()[mesesFichaEmAberto.length - 1]
    : undefined;
  if (!alvo || mesReferencia !== alvo) return doMes;
  const ja = new Set(doMes.map((v) => v.id));
  const orfaos = valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter(
    (v) => v.status === "pendente" && !ja.has(v.id) && !mesesFichaEmAberto.includes(v.mesReferencia)
  );
  return orfaos.length ? [...doMes, ...orfaos] : doMes;
}

export function valoresAvulsosHistoricoCooperado(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string,
  limite = 20,
  mesReferencia?: string
): ValorAvulsoReceber[] {
  return valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId)
    .filter((v) => v.status === "pago" && (!mesReferencia || v.mesReferencia === mesReferencia))
    .slice(0, limite);
}

export function totalValoresAvulsosPendentes(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): number {
  const lista = valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter((v) => v.status === "pendente");
  const filtrada = mesReferencia ? lista.filter((v) => v.mesReferencia === mesReferencia) : lista;
  return round2(
    filtrada
      .filter((v) => naturezaValorAvulso(v) === "credito")
      .reduce((s, v) => s + v.valor, 0)
  );
}

export function temValoresAvulsosPendentesMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): boolean {
  return valoresAvulsosPendentesMes(data, cooperadoId, mesReferencia, cooperativaId).length > 0;
}

/** Saldo líquido de avulsos pendentes (créditos − débitos), alinhado ao resumo do mês. */
export function saldoValoresAvulsosPendentes(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): number {
  return round2(
    totalValoresAvulsosPendentes(data, cooperadoId, mesReferencia, cooperativaId) -
      totalDebitosAvulsosPendentes(data, cooperadoId, mesReferencia, cooperativaId)
  );
}

export function totalDebitosAvulsosPendentes(
  data: AppData,
  cooperadoId: string,
  mesReferencia?: string,
  cooperativaId?: string
): number {
  const lista = valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).filter((v) => v.status === "pendente");
  const filtrada = mesReferencia ? lista.filter((v) => v.mesReferencia === mesReferencia) : lista;
  return round2(
    filtrada
      .filter((v) => naturezaValorAvulso(v) === "debito")
      .reduce((s, v) => s + v.valor, 0)
  );
}

export function valoresAvulsosDaCooperativa(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string,
  mesReferencia?: string
): ValorAvulsoReceber[] {
  return (data.valoresAvulsosReceber ?? [])
    .filter((v) => {
      if (v.cooperativaId !== cooperativaId) return false;
      if (cooperadoId && !avulsoPertenceCooperado(data, v, cooperadoId, cooperativaId)) return false;
      if (mesReferencia && v.mesReferencia !== mesReferencia) return false;
      return true;
    })
    .sort((a, b) => new Date(b.dataLancamento).getTime() - new Date(a.dataLancamento).getTime());
}

export function criarValorAvulsoReceber(
  data: AppData,
  params: {
    cooperativaId: string;
    cooperadoId: string;
    mesReferencia: string;
    motivo: string;
    valor: number;
    natureza?: NaturezaValorAvulso;
    responsavel: string;
    dataLancamento?: string;
    id?: string;
  }
): AppData {
  const now = new Date().toISOString();
  const canonico = resolverCooperadoIdCanonico(data, params.cooperadoId, params.cooperativaId);
  const novo: ValorAvulsoReceber = {
    id: params.id ?? `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cooperativaId: params.cooperativaId,
    cooperadoId: canonico,
    mesReferencia: params.mesReferencia,
    motivo: params.motivo.trim(),
    valor: round2(Math.max(0, params.valor)),
    natureza: params.natureza === "debito" ? "debito" : "credito",
    status: "pendente",
    responsavel: params.responsavel,
    dataLancamento: params.dataLancamento ?? now.split("T")[0],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...data,
    valoresAvulsosReceber: [...(data.valoresAvulsosReceber ?? []), novo],
  };
}

export function marcarValoresAvulsosPagosMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId?: string
): AppData {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const now = new Date().toISOString();
  const hoje = now.split("T")[0];
  const valoresAvulsosReceber = (data.valoresAvulsosReceber ?? []).map((v) => {
    if (v.mesReferencia !== mesReferencia || v.status !== "pendente") return v;
    if (!avulsoPertenceCooperado(data, v, cooperadoId, coopId)) return v;
    return { ...v, status: "pago" as const, dataPagamento: hoje, updatedAt: now };
  });
  return { ...data, valoresAvulsosReceber };
}

export function cancelarValorAvulsoReceber(data: AppData, id: string): AppData {
  return {
    ...data,
    valoresAvulsosReceber: (data.valoresAvulsosReceber ?? []).filter((v) => v.id !== id),
  };
}

/** Meses com valor avulso pendente ou histórico pago. */
export function mesesComValoresAvulsos(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): string[] {
  return [
    ...new Set(
      valoresAvulsosDoCooperado(data, cooperadoId, cooperativaId).map((v) => v.mesReferencia)
    ),
  ];
}
