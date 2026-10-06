/**
 * Regra operacional HB Créditos × ficha base (todas as cooperativas / cooperados / responsáveis).
 *
 * Padrão (ingresso no app): compras HB projetam em contaCoopDescontos, entram no resumo
 * de pagamento e abatem o “A receber”, com meses = débito em aberto na ficha.
 *
 * Regressão (formato anterior):
 *   NEXT_PUBLIC_HB_FICHA_BASE_LEGACY=1
 *   ou document.documentElement.setAttribute('data-hb-ficha-base-legacy', '1')
 *
 * Desligar projeção (emergência):
 *   NEXT_PUBLIC_HB_FICHA_BASE_PROJECTION=0
 *   ou data-hb-ficha-base-off="1" no <html>
 *
 * Complementa NEXT_PUBLIC_CONTA_COOP_VALOR_RECEBER_PUBLIC=0 (desliga abatimento no resumo).
 */
import type { AppData } from "@/types";
import { mesesReferenciaComDebitoAberto } from "@/services/notaPedidoService";
import { hbCreditMesesReferenciaUnificados } from "@/lib/hb-credit/hbCreditLeituraBic";
import { isContaCoopValorReceberPilot } from "@/utils/contaCoopUiVisibility";

function readEnvOn(name: string, defaultOn = true): boolean {
  if (typeof process === "undefined") return defaultOn;
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

function killSwitchOff(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-hb-ficha-base-off") === "1";
}

function legacyDom(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-hb-ficha-base-legacy") === "1";
}

/** Projeção HB → ficha ativa (padrão: sim, para qualquer cooperativa no app). */
export function isHbFichaBaseProjectionEnabled(): boolean {
  if (killSwitchOff()) return false;
  return readEnvOn("NEXT_PUBLIC_HB_FICHA_BASE_PROJECTION", true);
}

/** Formato anterior: meses BIC unificados (exclui mês com PIX confirmado) e sem repair servidor pós-compra. */
export function isHbFichaBaseProjectionLegacy(): boolean {
  if (legacyDom()) return true;
  return readEnvOn("NEXT_PUBLIC_HB_FICHA_BASE_LEGACY", false);
}

/** Cliente e cron devem sincronizar descontos HB no arquivo mensal / resumo. */
export function shouldSyncHbFichaBaseDescontos(cooperadoId?: string, cooperadoNome?: string): boolean {
  if (!isHbFichaBaseProjectionEnabled()) return false;
  return isContaCoopValorReceberPilot(cooperadoId, cooperadoNome);
}

/** Authorize / estorno / cron gravam operacional.json na nuvem. */
export function shouldProjectHbFichaBaseOnServer(): boolean {
  return shouldSyncHbFichaBaseDescontos() && !isHbFichaBaseProjectionLegacy();
}

/**
 * Meses em que compras HB abatem o valor a receber — mesma base do resumo de pagamento.
 * Legacy: hbCreditMesesReferenciaUnificados (comportamento pré-alinhamento ficha).
 */
export function listMesesReferenciaHbFichaBaseSync(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesFallback?: string
): string[] {
  if (isHbFichaBaseProjectionLegacy()) {
    return hbCreditMesesReferenciaUnificados(data, cooperadoId, cooperativaId, mesFallback);
  }
  return mesesReferenciaComDebitoAberto(data, cooperadoId, cooperativaId);
}

export function hbFichaBaseOperacionalActiveLabels(): string[] {
  const out: string[] = [];
  if (!isHbFichaBaseProjectionEnabled()) {
    out.push("off");
    return out;
  }
  if (isHbFichaBaseProjectionLegacy()) out.push("legacy");
  else out.push("fichaBase");
  if (shouldSyncHbFichaBaseDescontos()) out.push("sync");
  if (shouldProjectHbFichaBaseOnServer()) out.push("serverProject");
  return out;
}
