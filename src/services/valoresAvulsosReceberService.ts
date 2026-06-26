import type { AppData, ValorAvulsoReceber } from "@/types";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { round2 } from "@/utils/calculations";

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
  return round2(filtrada.reduce((s, v) => s + v.valor, 0));
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
    responsavel: string;
    dataLancamento?: string;
  }
): AppData {
  const now = new Date().toISOString();
  const canonico = resolverCooperadoIdCanonico(data, params.cooperadoId, params.cooperativaId);
  const novo: ValorAvulsoReceber = {
    id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cooperativaId: params.cooperativaId,
    cooperadoId: canonico,
    mesReferencia: params.mesReferencia,
    motivo: params.motivo.trim(),
    valor: round2(Math.max(0, params.valor)),
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
