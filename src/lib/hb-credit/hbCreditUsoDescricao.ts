/**
 * Texto do uso HB na ficha / Financeiro / Pagar:
 * mercado pelo nome, ou «Crédito para {cooperado}» na transferência.
 */

const PREFIXO_COOPERADO = /^cooperado\s*[·\-–:]\s*/i;

export function nomeDestinoHbUso(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(PREFIXO_COOPERADO, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMotivoHbUsoGenerico(motivo: string): boolean {
  const m = motivo.trim().toLowerCase();
  if (!m) return true;
  if (m === "compra hb créditos" || m === "compra hb creditos") return true;
  if (/^compra hb cr[eé]ditos\s*[—–-]\s*mercado(\s*\(|$)/i.test(motivo.trim())) return true;
  if (/^compra hb cr[eé]ditos\s*[—–-]\s*mercado parceiro(\s*\(|$)/i.test(motivo.trim())) return true;
  return false;
}

export type HbCreditUsoKind = "mercado" | "transferencia" | "estorno_mercado" | "estorno_transferencia";

export function formatHbCreditUsoMotivo(opts: {
  kind: HbCreditUsoKind;
  nome?: string | null;
  receiptCode?: string | null;
  reversed?: boolean;
}): string {
  const nome = nomeDestinoHbUso(opts.nome);
  const receipt = opts.receiptCode?.trim();
  const sufixoRecibo = receipt ? ` (${receipt})` : "";
  const estornada = opts.reversed ? " (estornada)" : "";

  if (opts.kind === "transferencia") {
    const quem = nome || "cooperado";
    return `Crédito para ${quem}${sufixoRecibo}${estornada}`;
  }
  if (opts.kind === "estorno_transferencia") {
    const quem = nome || "cooperado";
    return `Estorno HB Créditos — crédito para ${quem}${sufixoRecibo}`;
  }
  if (opts.kind === "estorno_mercado") {
    const mercado = nome || "mercado";
    return `Estorno HB Créditos — ${mercado}${sufixoRecibo}`;
  }
  const mercado = nome && !/^mercado( parceiro)?$/i.test(nome) ? nome : nome || "mercado";
  return `Compra HB Créditos — ${mercado}${sufixoRecibo}${estornada}`;
}

export function preferMotivoHbUsoEspecifico(atual: string, candidato: string): string {
  if (isMotivoHbUsoGenerico(atual) && candidato.trim() && !isMotivoHbUsoGenerico(candidato)) {
    return candidato.trim();
  }
  return atual;
}
