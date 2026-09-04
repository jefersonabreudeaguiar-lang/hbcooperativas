import { CONTA_COOP_DESCONTO_SPLIT } from "@/config/contaCoopEconomia";
import { formatCnpj, normalizeCnpj } from "@/utils/cooperativa";
import { getCurrentMesReferencia } from "@/utils/format";

export interface ContaCoopCooperativaAdminRow {
  cooperativaId: string;
  cooperativaNome: string;
  cooperativaCnpj: string;
  cnpjFormatado: string;
  transacoes: number;
  descontoTotalCents: number;
  cashbackCents: number;
  appCents: number;
  coopCents: number;
  appRepassePendenteCents: number;
  appRepassePagoCents: number;
  mercadosAtivos: number;
  repasseConfirmado: boolean;
}

export interface ContaCoopRepasseAdminRow {
  cooperativaCnpj: string;
  cooperativaNome: string;
  amountCents: number;
  responsavelNome: string;
  paidAt: string;
}

export interface ContaCoopPlatformOverview {
  mesReferencia: string;
  split: typeof CONTA_COOP_DESCONTO_SPLIT;
  totais: {
    cooperativasComMovimento: number;
    transacoes: number;
    descontoTotalCents: number;
    cashbackCents: number;
    appCents: number;
    coopCents: number;
    appRepassePendenteCents: number;
    appRepassePagoCents: number;
    mercadosAtivos: number;
  };
  cooperativas: ContaCoopCooperativaAdminRow[];
  repassesMes: ContaCoopRepasseAdminRow[];
}

function cents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildContaCoopPlatformOverview(input: {
  mesReferencia: string;
  cooperativas: Array<{ id: string; nome: string; cnpj: string }>;
  allocations: Array<Record<string, unknown>>;
  partners: Array<Record<string, unknown>>;
  repasses: Array<Record<string, unknown>>;
}): ContaCoopPlatformOverview {
  const coopByCnpj = new Map(
    input.cooperativas.map((coop) => [normalizeCnpj(coop.cnpj), coop])
  );

  const byCnpj = new Map<string, ContaCoopCooperativaAdminRow>();
  for (const coop of input.cooperativas) {
    const cnpj = normalizeCnpj(coop.cnpj);
    if (cnpj.length !== 14) continue;
    byCnpj.set(cnpj, {
      cooperativaId: coop.id,
      cooperativaNome: coop.nome,
      cooperativaCnpj: cnpj,
      cnpjFormatado: formatCnpj(cnpj),
      transacoes: 0,
      descontoTotalCents: 0,
      cashbackCents: 0,
      appCents: 0,
      coopCents: 0,
      appRepassePendenteCents: 0,
      appRepassePagoCents: 0,
      mercadosAtivos: 0,
      repasseConfirmado: false,
    });
  }

  for (const row of input.allocations) {
    const cnpj = normalizeCnpj(String(row.cooperative_cnpj ?? ""));
    if (cnpj.length !== 14) continue;
    const meta = coopByCnpj.get(cnpj);
    const atual = byCnpj.get(cnpj) ?? {
      cooperativaId: meta?.id ?? cnpj,
      cooperativaNome: meta?.nome ?? cnpj,
      cooperativaCnpj: cnpj,
      cnpjFormatado: formatCnpj(cnpj),
      transacoes: 0,
      descontoTotalCents: 0,
      cashbackCents: 0,
      appCents: 0,
      coopCents: 0,
      appRepassePendenteCents: 0,
      appRepassePagoCents: 0,
      mercadosAtivos: 0,
      repasseConfirmado: false,
    };

    atual.transacoes += 1;
    atual.descontoTotalCents += cents(row.discount_cents);
    atual.cashbackCents += cents(row.cashback_cents);
    atual.appCents += cents(row.app_cents);
    atual.coopCents += cents(row.coop_cents);

    const appCentsRow = cents(row.app_cents);
    if (row.app_repasse_id) {
      atual.appRepassePagoCents += appCentsRow;
    } else if (row.app_pool_status === "LIQUIDATED") {
      atual.appRepassePendenteCents += appCentsRow;
    }

    byCnpj.set(cnpj, atual);
  }

  const mercadosPorCnpj = new Map<string, number>();
  for (const partner of input.partners) {
    if (String(partner.status ?? "") !== "ACTIVE") continue;
    const cnpj = normalizeCnpj(String(partner.cooperative_cnpj ?? ""));
    if (cnpj.length !== 14) continue;
    mercadosPorCnpj.set(cnpj, (mercadosPorCnpj.get(cnpj) ?? 0) + 1);
  }

  for (const [cnpj, count] of mercadosPorCnpj) {
    const row = byCnpj.get(cnpj);
    if (row) row.mercadosAtivos = count;
  }

  const repasseConfirmado = new Set(
    input.repasses.map((row) => normalizeCnpj(String(row.cooperative_cnpj ?? "")))
  );
  for (const cnpj of repasseConfirmado) {
    const row = byCnpj.get(cnpj);
    if (row) row.repasseConfirmado = true;
  }

  const cooperativas = [...byCnpj.values()]
    .filter((row) => row.transacoes > 0 || row.mercadosAtivos > 0)
    .sort((a, b) => b.appCents - a.appCents || a.cooperativaNome.localeCompare(b.cooperativaNome, "pt-BR"));

  const repassesMes: ContaCoopRepasseAdminRow[] = input.repasses
    .map((row) => {
      const cnpj = normalizeCnpj(String(row.cooperative_cnpj ?? ""));
      const coop = coopByCnpj.get(cnpj);
      return {
        cooperativaCnpj: cnpj,
        cooperativaNome: coop?.nome ?? cnpj,
        amountCents: cents(row.amount_cents),
        responsavelNome: String(row.responsavel_nome ?? "—"),
        paidAt: String(row.paid_at ?? row.created_at ?? new Date().toISOString()),
      };
    })
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  const totais = cooperativas.reduce(
    (acc, row) => {
      acc.transacoes += row.transacoes;
      acc.descontoTotalCents += row.descontoTotalCents;
      acc.cashbackCents += row.cashbackCents;
      acc.appCents += row.appCents;
      acc.coopCents += row.coopCents;
      acc.appRepassePendenteCents += row.appRepassePendenteCents;
      acc.appRepassePagoCents += row.appRepassePagoCents;
      acc.mercadosAtivos += row.mercadosAtivos;
      return acc;
    },
    {
      cooperativasComMovimento: cooperativas.filter((row) => row.transacoes > 0).length,
      transacoes: 0,
      descontoTotalCents: 0,
      cashbackCents: 0,
      appCents: 0,
      coopCents: 0,
      appRepassePendenteCents: 0,
      appRepassePagoCents: 0,
      mercadosAtivos: 0,
    }
  );

  return {
    mesReferencia: input.mesReferencia,
    split: CONTA_COOP_DESCONTO_SPLIT,
    totais,
    cooperativas,
    repassesMes,
  };
}

export function defaultMesReferenciaContaCoopAdmin(): string {
  return getCurrentMesReferencia();
}

export function formatCentsAdmin(centsValue: number): string {
  return (centsValue / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
