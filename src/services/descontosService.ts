import type { AppData, Desconto } from "@/types";

export const TIPO_DESCONTO_LABELS: Record<Desconto["tipo"], string> = {
  cooperativa_padrao: "Desconto padrão da cooperativa",
  mensalidade_aberta: "Mensalidade em aberto",
  cota_aberta: "Cota em aberto",
  manual: "Desconto manual",
};

export function descontosDoCooperadoNoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string
): Desconto[] {
  return data.descontos
    .filter((d) => d.cooperadoId === cooperadoId && d.data.startsWith(mesReferencia))
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
}

export function descontosDaCooperativa(
  data: AppData,
  cooperativaId: string,
  cooperadoId?: string
): Desconto[] {
  const ids = new Set(
    data.cooperados.filter((c) => c.cooperativaId === cooperativaId).map((c) => c.id)
  );
  return data.descontos.filter((d) => {
    if (!ids.has(d.cooperadoId)) return false;
    if (cooperadoId && d.cooperadoId !== cooperadoId) return false;
    return true;
  });
}
