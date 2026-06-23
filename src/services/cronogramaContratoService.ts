import type {
  AppData,
  CronogramaContratoItem,
  CronogramaContratoMensal,
  ProdutoInstituicao,
} from "@/types";
import { round2 } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";

export function calcValorLimiteCronograma(itens: CronogramaContratoItem[]): number {
  return round2(itens.reduce((s, i) => s + i.valorPrevisto, 0));
}

export function buildItensCronogramaFromProdutos(
  produtos: ProdutoInstituicao[],
  quantidades: Record<string, string>
): CronogramaContratoItem[] {
  const itens: CronogramaContratoItem[] = [];
  for (const p of produtos) {
    const qty = parseFloat((quantidades[p.id] ?? "").replace(",", ".")) || 0;
    if (qty <= 0) continue;
    itens.push({
      produtoInstituicaoId: p.id,
      produtoNome: p.nome,
      unidade: p.unidade,
      precoUnitario: p.precoUnitario,
      quantidadePrevista: round2(qty),
      valorPrevisto: round2(qty * p.precoUnitario),
    });
  }
  return itens;
}

export function getCronogramaMes(
  data: AppData,
  instituicaoId: string,
  mesReferencia: string,
  cooperativaId?: string
): CronogramaContratoMensal | undefined {
  return (data.cronogramasContrato ?? []).find(
    (c) =>
      c.instituicaoId === instituicaoId &&
      c.mesReferencia === mesReferencia &&
      (!cooperativaId || c.cooperativaId === cooperativaId)
  );
}

export function listMesesCronogramaInstituicao(
  data: AppData,
  instituicaoId: string,
  cooperativaId?: string
): string[] {
  const set = new Set(
    (data.cronogramasContrato ?? [])
      .filter(
        (c) =>
          c.instituicaoId === instituicaoId && (!cooperativaId || c.cooperativaId === cooperativaId)
      )
      .map((c) => c.mesReferencia)
  );
  set.add(getCurrentMesReferencia());
  return [...set].sort().reverse();
}

export function upsertCronogramaMes(
  data: AppData,
  params: {
    id?: string;
    cooperativaId: string;
    instituicaoId: string;
    mesReferencia: string;
    anotacaoMes?: string;
    fotos?: string[];
    fotosMiniaturas?: string[];
    itens: CronogramaContratoItem[];
    lancadoPor?: string;
  }
): AppData {
  const now = new Date().toISOString();
  const valorLimiteEntrega = calcValorLimiteCronograma(params.itens);
  const existente = (data.cronogramasContrato ?? []).find(
    (c) =>
      c.instituicaoId === params.instituicaoId &&
      c.mesReferencia === params.mesReferencia &&
      c.cooperativaId === params.cooperativaId
  );

  const registro: CronogramaContratoMensal = {
    id: params.id ?? existente?.id ?? `cr_${Date.now()}`,
    cooperativaId: params.cooperativaId,
    instituicaoId: params.instituicaoId,
    mesReferencia: params.mesReferencia,
    anotacaoMes: params.anotacaoMes?.trim() || undefined,
    fotos: params.fotos ?? existente?.fotos,
    fotosMiniaturas: params.fotosMiniaturas ?? existente?.fotosMiniaturas,
    itens: params.itens,
    valorLimiteEntrega,
    lancadoPor: params.lancadoPor ?? existente?.lancadoPor,
    createdAt: existente?.createdAt ?? now,
    updatedAt: now,
  };

  const restantes = (data.cronogramasContrato ?? []).filter(
    (c) =>
      !(
        c.instituicaoId === params.instituicaoId &&
        c.mesReferencia === params.mesReferencia &&
        c.cooperativaId === params.cooperativaId
      )
  );

  return { ...data, cronogramasContrato: [...restantes, registro] };
}

export function removerCronogramasInstituicao(data: AppData, instituicaoId: string): AppData {
  const cronogramasContrato = (data.cronogramasContrato ?? []).filter(
    (c) => c.instituicaoId !== instituicaoId
  );
  if (cronogramasContrato.length === (data.cronogramasContrato ?? []).length) return data;
  return { ...data, cronogramasContrato };
}
