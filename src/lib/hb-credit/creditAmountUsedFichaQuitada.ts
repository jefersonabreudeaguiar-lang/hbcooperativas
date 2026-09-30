import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";
import { titularCooperadoIds } from "@/lib/hb-credit/repairOperacionalContaCoopDescontos";
import { getMesesReferenciaPagamento } from "@/services/notaPedidoService";
import type { Cooperado } from "@/types";

export type PaymentRowForUsedWithMeta = {
  id?: string;
  cooperado_id?: string;
  created_at?: string;
  event_type: string;
  status: string;
  amount_cents: number | string | null;
  credit_debited_cents?: number | string | null;
};

export function mesReferenciaRangeUtc(mesReferencia: string): { startMs: number; endMs: number } {
  const [year, month] = mesReferencia.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, 1);
  const endMs = Date.UTC(year, month, 1);
  return { startMs, endMs };
}

type FichaQuitadaWindow = {
  mesReferencia: string;
  startMs: number;
  quitadoAteMs: number;
};

function pagamentoQuitadoAteMs(p: { assinadoEm?: string; updatedAt?: string; pagoEm?: string; createdAt: string }): number {
  const iso = p.assinadoEm ?? p.updatedAt ?? p.pagoEm ?? p.createdAt;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

/** Meses com pagamento confirmado (recibo assinado) — compras HB desses períodos não entram no “utilizado”. */
export function buildFichaQuitadaWindowsForTitularIds(
  operacional: OperacionalSyncPayload,
  titularIds: string[]
): { explicitTransactionIds: Set<string>; windows: FichaQuitadaWindow[] } {
  const titular = new Set(titularIds);
  const explicitTransactionIds = new Set<string>();
  const windows: FichaQuitadaWindow[] = [];
  const mesConfirmado = new Set<string>();

  for (const p of operacional.pagamentosCooperado ?? []) {
    if (p.status !== "confirmado") continue;
    if (!titular.has(p.cooperadoId)) continue;
    const quitadoAteMs = pagamentoQuitadoAteMs(p);
    for (const mes of getMesesReferenciaPagamento(p)) {
      mesConfirmado.add(`${p.cooperadoId}|${mes}`);
      const { startMs } = mesReferenciaRangeUtc(mes);
      windows.push({ mesReferencia: mes, startMs, quitadoAteMs });
    }
  }

  for (const arq of operacional.arquivosMensais ?? []) {
    if (!titular.has(arq.cooperadoId)) continue;
    const key = `${arq.cooperadoId}|${arq.mesReferencia}`;
    if (!mesConfirmado.has(key)) continue;
    for (const d of arq.contaCoopDescontos ?? []) {
      const id = d.hbTransactionId?.trim();
      if (id) explicitTransactionIds.add(id);
    }
  }

  return { explicitTransactionIds, windows };
}

export function buildFichaQuitadaContextForCooperado(
  operacional: OperacionalSyncPayload,
  cooperados: Cooperado[],
  cooperadoId: string
): { explicitTransactionIds: Set<string>; windows: FichaQuitadaWindow[] } {
  const titularIds = titularCooperadoIds(cooperados, cooperadoId);
  return buildFichaQuitadaWindowsForTitularIds(operacional, titularIds);
}

function paymentDebitCents(row: PaymentRowForUsedWithMeta): number {
  const debit =
    row.credit_debited_cents != null && row.credit_debited_cents !== ""
      ? Number(row.credit_debited_cents)
      : Number(row.amount_cents ?? 0);
  return Number.isFinite(debit) && debit > 0 ? Math.round(debit) : 0;
}

export function isHbPaymentQuitadoNaFicha(
  row: PaymentRowForUsedWithMeta,
  ctx: { explicitTransactionIds: Set<string>; windows: FichaQuitadaWindow[] }
): boolean {
  if (String(row.event_type) !== "PAYMENT" || String(row.status) !== "posted") return false;
  const id = row.id ? String(row.id) : "";
  if (id && ctx.explicitTransactionIds.has(id)) return true;
  const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
  if (!Number.isFinite(createdMs)) return false;
  for (const w of ctx.windows) {
    if (createdMs >= w.startMs && createdMs <= w.quitadoAteMs) return true;
  }
  return false;
}

/**
 * Crédito ainda “em uso” = PAYMENT posted menos compras já quitadas na ficha (pagamento confirmado).
 */
export function computeAmountUsedCentsFromPayments(
  rows: PaymentRowForUsedWithMeta[],
  fichaQuitada?: { explicitTransactionIds: Set<string>; windows: FichaQuitadaWindow[] }
): number {
  let total = 0;
  for (const row of rows) {
    if (String(row.event_type) !== "PAYMENT" || String(row.status) !== "posted") continue;
    if (fichaQuitada && isHbPaymentQuitadoNaFicha(row, fichaQuitada)) continue;
    total += paymentDebitCents(row);
  }
  return Math.max(0, total);
}
