function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type DescontoContaCoopRemoto = {
  motivo: string;
  valorReais: number;
  tipo: "conta_coop";
  createdAt: string;
  /** Quando preenchido, identifica unicamente hb_credit_transactions.id no A receber. */
  hbTransactionId?: string;
};

export function isEstornoMotivoContaCoop(motivo: string): boolean {
  return motivo.toLowerCase().includes("estorno");
}

/** Recibo no motivo legado, ex.: `(009AEE5F)`. */
export function extrairReceiptCodeMotivoContaCoop(motivo: string): string | undefined {
  const m = motivo.match(/\(([A-Fa-f0-9]{6,})\)\s*(?:\(|$|estornada)/);
  if (m?.[1]) return m[1].toUpperCase();
  const m2 = motivo.match(/\(([A-Fa-f0-9]{6,})\)\s*$/);
  return m2?.[1]?.toUpperCase();
}

/**
 * Chave de incidência financeira no A receber — uma transação HB = no máximo uma chave.
 * Com hbTransactionId: dedupe estrito por id.
 * Legado: recibo + instante + valor + tipo (compra vs estorno), sem colapsar parceiros distintos.
 */
export function chaveIncidenciaHbDescontoContaCoop(d: DescontoContaCoopRemoto): string {
  const txId = d.hbTransactionId?.trim();
  if (txId) return `tx:${txId}`;

  const estorno = isEstornoMotivoContaCoop(d.motivo);
  const kind = estorno ? "refund" : "payment";
  const receipt = extrairReceiptCodeMotivoContaCoop(d.motivo);
  if (receipt) {
    return `legacy:${kind}|${d.createdAt}|${round2(d.valorReais)}|rc:${receipt}`;
  }
  if (estorno) {
    return `legacy:${kind}|${d.createdAt}|${round2(d.valorReais)}|${d.motivo}`;
  }
  return `legacy:line|${d.createdAt}|${round2(d.valorReais)}|${d.motivo}`;
}

function preferDescontoCanonico(
  prev: DescontoContaCoopRemoto,
  next: DescontoContaCoopRemoto
): DescontoContaCoopRemoto {
  if (!prev.hbTransactionId?.trim() && next.hbTransactionId?.trim()) return next;
  return prev;
}

function legacyAliasKey(d: DescontoContaCoopRemoto): string | undefined {
  const receipt = extrairReceiptCodeMotivoContaCoop(d.motivo);
  if (!receipt) return undefined;
  const estorno = isEstornoMotivoContaCoop(d.motivo);
  const kind = estorno ? "refund" : "payment";
  return `legacy:${kind}|${d.createdAt}|${round2(d.valorReais)}|rc:${receipt}`;
}

function primaryKey(d: DescontoContaCoopRemoto): string {
  const txId = d.hbTransactionId?.trim();
  if (txId) return `tx:${txId}`;
  return chaveIncidenciaHbDescontoContaCoop(d);
}

/** Garante no máximo uma incidência por transação HB (ou par legado equivalente). */
export function dedupeIncidenciaHbDescontosContaCoop(
  descontos: DescontoContaCoopRemoto[]
): DescontoContaCoopRemoto[] {
  const byPrimary = new Map<string, DescontoContaCoopRemoto>();
  const legacyToPrimary = new Map<string, string>();
  const order: string[] = [];

  for (const d of descontos) {
    if (d.valorReais <= 0) continue;
    const alias = legacyAliasKey(d);
    if (alias) {
      const linked = legacyToPrimary.get(alias);
      if (linked && byPrimary.has(linked)) {
        byPrimary.set(linked, preferDescontoCanonico(byPrimary.get(linked)!, d));
        continue;
      }
    }

    const pk = primaryKey(d);
    const prev = byPrimary.get(pk);
    if (prev) {
      byPrimary.set(pk, preferDescontoCanonico(prev, d));
      if (alias) legacyToPrimary.set(alias, pk);
      continue;
    }

    byPrimary.set(pk, d);
    order.push(pk);
    if (alias) legacyToPrimary.set(alias, pk);
  }

  return order.map((k) => byPrimary.get(k)!);
}
