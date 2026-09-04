import {
  CONTA_COOP_DESCONTO_SPLIT,
  MENSALIDADE_COOPERADO_VALOR_PADRAO,
} from "@/config/contaCoopEconomia";
import { PROPRIETARIO_APP } from "@/config/contratoServicoApp";
import { formatCnpj, normalizeCnpj } from "@/utils/cooperativa";
import { getCurrentMesReferencia } from "@/utils/format";

export interface ContaCoopCooperativaAdminRow {
  cooperativaId: string;
  cooperativaNome: string;
  cooperativaCnpj: string;
  cnpjFormatado: string;
  transacoes: number;
  grossTotalCents: number;
  descontoTotalCents: number;
  netPartnerCents: number;
  cashbackCents: number;
  appCents: number;
  coopCents: number;
  appPendenteLiquidacaoCents: number;
  appRepassePendenteCents: number;
  appRepassePagoCents: number;
  coopPendenteCents: number;
  coopLiquidadoCents: number;
  mercadosAtivos: number;
  repasseConfirmado: boolean;
}

export interface ContaCoopRepasseAdminRow {
  cooperativaCnpj: string;
  cooperativaNome: string;
  amountCents: number;
  responsavelNome: string;
  paidAt: string;
  comprovanteMemo?: string | null;
}

export interface ContaCoopPlatformOverview {
  mesReferencia: string;
  split: typeof CONTA_COOP_DESCONTO_SPLIT;
  mensalidadeCooperado: number;
  pixRepasse: {
    chave: string;
    nome: string;
    cpfFormatado: string;
  };
  totais: {
    cooperativasCadastradas: number;
    cooperativasComMovimento: number;
    mercadosAtivos: number;
    transacoes: number;
    grossTotalCents: number;
    descontoTotalCents: number;
    netPartnerCents: number;
    cashbackCents: number;
    appCents: number;
    coopCents: number;
    appPendenteLiquidacaoCents: number;
    appRepassePendenteCents: number;
    appRepassePagoCents: number;
    coopPendenteCents: number;
    coopLiquidadoCents: number;
  };
  cooperativas: ContaCoopCooperativaAdminRow[];
  repassesMes: ContaCoopRepasseAdminRow[];
}

function cents(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyCoopRow(
  coop: { id: string; nome: string; cnpj: string },
  cnpj: string
): ContaCoopCooperativaAdminRow {
  return {
    cooperativaId: coop.id,
    cooperativaNome: coop.nome,
    cooperativaCnpj: cnpj,
    cnpjFormatado: formatCnpj(cnpj),
    transacoes: 0,
    grossTotalCents: 0,
    descontoTotalCents: 0,
    netPartnerCents: 0,
    cashbackCents: 0,
    appCents: 0,
    coopCents: 0,
    appPendenteLiquidacaoCents: 0,
    appRepassePendenteCents: 0,
    appRepassePagoCents: 0,
    coopPendenteCents: 0,
    coopLiquidadoCents: 0,
    mercadosAtivos: 0,
    repasseConfirmado: false,
  };
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
    byCnpj.set(cnpj, emptyCoopRow(coop, cnpj));
  }

  for (const row of input.allocations) {
    const cnpj = normalizeCnpj(String(row.cooperative_cnpj ?? ""));
    if (cnpj.length !== 14) continue;
    const meta = coopByCnpj.get(cnpj);
    const atual = byCnpj.get(cnpj) ?? emptyCoopRow(
      { id: meta?.id ?? cnpj, nome: meta?.nome ?? cnpj, cnpj },
      cnpj
    );

    atual.transacoes += 1;
    atual.grossTotalCents += cents(row.gross_cents);
    atual.descontoTotalCents += cents(row.discount_cents);
    atual.netPartnerCents += cents(row.net_partner_cents);
    atual.cashbackCents += cents(row.cashback_cents);
    atual.appCents += cents(row.app_cents);
    atual.coopCents += cents(row.coop_cents);

    const appCentsRow = cents(row.app_cents);
    const coopCentsRow = cents(row.coop_cents);
    const appPool = String(row.app_pool_status ?? "");
    const coopPool = String(row.coop_pool_status ?? "");

    if (appPool === "PENDING") {
      atual.appPendenteLiquidacaoCents += appCentsRow;
    } else if (appPool === "LIQUIDATED") {
      if (row.app_repasse_id) {
        atual.appRepassePagoCents += appCentsRow;
      } else {
        atual.appRepassePendenteCents += appCentsRow;
      }
    }

    if (coopPool === "PENDING") {
      atual.coopPendenteCents += coopCentsRow;
    } else if (coopPool === "LIQUIDATED") {
      atual.coopLiquidadoCents += coopCentsRow;
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

  const cooperativas = [...byCnpj.values()].sort(
    (a, b) =>
      b.appCents - a.appCents ||
      b.transacoes - a.transacoes ||
      a.cooperativaNome.localeCompare(b.cooperativaNome, "pt-BR")
  );

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
        comprovanteMemo: row.comprovante_memo ? String(row.comprovante_memo) : null,
      };
    })
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  const totais = cooperativas.reduce(
    (acc, row) => {
      acc.transacoes += row.transacoes;
      acc.grossTotalCents += row.grossTotalCents;
      acc.descontoTotalCents += row.descontoTotalCents;
      acc.netPartnerCents += row.netPartnerCents;
      acc.cashbackCents += row.cashbackCents;
      acc.appCents += row.appCents;
      acc.coopCents += row.coopCents;
      acc.appPendenteLiquidacaoCents += row.appPendenteLiquidacaoCents;
      acc.appRepassePendenteCents += row.appRepassePendenteCents;
      acc.appRepassePagoCents += row.appRepassePagoCents;
      acc.coopPendenteCents += row.coopPendenteCents;
      acc.coopLiquidadoCents += row.coopLiquidadoCents;
      acc.mercadosAtivos += row.mercadosAtivos;
      return acc;
    },
    {
      cooperativasCadastradas: input.cooperativas.length,
      cooperativasComMovimento: 0,
      mercadosAtivos: 0,
      transacoes: 0,
      grossTotalCents: 0,
      descontoTotalCents: 0,
      netPartnerCents: 0,
      cashbackCents: 0,
      appCents: 0,
      coopCents: 0,
      appPendenteLiquidacaoCents: 0,
      appRepassePendenteCents: 0,
      appRepassePagoCents: 0,
      coopPendenteCents: 0,
      coopLiquidadoCents: 0,
    }
  );

  totais.cooperativasComMovimento = cooperativas.filter((row) => row.transacoes > 0).length;

  return {
    mesReferencia: input.mesReferencia,
    split: CONTA_COOP_DESCONTO_SPLIT,
    mensalidadeCooperado: MENSALIDADE_COOPERADO_VALOR_PADRAO,
    pixRepasse: {
      chave: PROPRIETARIO_APP.pixChave,
      nome: PROPRIETARIO_APP.pixNome,
      cpfFormatado: PROPRIETARIO_APP.cpfFormatado,
    },
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
