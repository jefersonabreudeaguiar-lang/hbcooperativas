import type { AppData } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { clearNotasSyncMeta } from "@/services/syncMetaService";

/** Incremente ao publicar uma limpeza global de lançamentos nos dispositivos. */
export const OPERATIONAL_RESET_VERSION = 10;

export const OPERATIONAL_RESET_STORAGE_KEY = "coopeagriplla_operational_reset_v";
export const OPERATIONAL_RESET_CLOUD_KEY = "coopeagriplla_operational_reset_cloud_v";
const CLOUD_RESET_APPLIED_PREFIX = "coopeagriplla_cloud_reset_applied_";

export function needsOperationalResetCloudPush(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(OPERATIONAL_RESET_CLOUD_KEY) === "pending";
}

export function markOperationalResetCloudPending(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OPERATIONAL_RESET_CLOUD_KEY, "pending");
}

export function markOperationalResetCloudDone(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OPERATIONAL_RESET_CLOUD_KEY);
}

export function getCloudResetAppliedVersion(cnpj: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(`${CLOUD_RESET_APPLIED_PREFIX}${normalizeCnpj(cnpj)}`);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function markCloudResetApplied(cnpj: string, version: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${CLOUD_RESET_APPLIED_PREFIX}${normalizeCnpj(cnpj)}`, String(version));
}

/** Remove entregas, fichas, pagamentos, mensalidades e avisos; mantém cadastros e contratos. */
export function clearOperationalData(data: AppData): AppData {
  return {
    ...data,
    cooperativas: data.cooperativas.map((c) => ({
      ...c,
      mensalidadeConfig: c.mensalidadeConfig
        ? {
            ...c.mensalidadeConfig,
            valorPadrao: 0,
            gerarAutomaticamente: false,
            mesesCobranca: [],
            lembreteAtivo: false,
          }
        : c.mensalidadeConfig,
    })),
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    mensalidades: [],
    cotas: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    comunicados: [],
    reclamacoes: [],
    auditLog: [],
  };
}

/** Limpa lançamentos operacionais de uma cooperativa (sync após reset na nuvem). */
export function clearOperationalDataForCooperativa(data: AppData, coopId: string): AppData {
  const cooperadoIds = new Set(
    data.cooperados.filter((c) => c.cooperativaId === coopId).map((c) => c.id)
  );
  const belongsToCoop = <T extends { cooperativaId?: string }>(item: T) =>
    item.cooperativaId === coopId;
  const belongsToCoopCooperado = <T extends { cooperadoId?: string }>(item: T) =>
    Boolean(item.cooperadoId && cooperadoIds.has(item.cooperadoId));

  return {
    ...data,
    cooperativas: data.cooperativas.map((c) =>
      c.id === coopId
        ? {
            ...c,
            mensalidadeConfig: c.mensalidadeConfig
              ? {
                  ...c.mensalidadeConfig,
                  valorPadrao: 0,
                  gerarAutomaticamente: false,
                  mesesCobranca: [],
                  lembreteAtivo: false,
                }
              : c.mensalidadeConfig,
          }
        : c
    ),
    notasPedido: data.notasPedido.filter((n) => n.cooperativaId !== coopId),
    fichaCorrida: data.fichaCorrida.filter((f) => !cooperadoIds.has(f.cooperadoId)),
    pagamentosCooperado: data.pagamentosCooperado.filter((p) => !belongsToCoop(p)),
    arquivosMensais: data.arquivosMensais.filter((a) => !belongsToCoop(a)),
    ajustesFichaMes: (data.ajustesFichaMes ?? []).filter((a) => !belongsToCoop(a)),
    mensalidades: data.mensalidades.filter((m) => !cooperadoIds.has(m.cooperadoId)),
    cotas: data.cotas.filter((c) => !belongsToCoopCooperado(c)),
    entregas: data.entregas.filter((e) => !belongsToCoopCooperado(e)),
    descontos: data.descontos.filter((d) => !cooperadoIds.has(d.cooperadoId)),
    valoresAvulsosReceber: (data.valoresAvulsosReceber ?? []).filter((v) => !belongsToCoop(v)),
    pagamentos: data.pagamentos.filter((p) => !belongsToCoopCooperado(p)),
    financeiro: [],
    fechamentos: [],
    livroCaixa: (data.livroCaixa ?? []).filter((l) => !belongsToCoop(l)),
    prestacoesContas: (data.prestacoesContas ?? []).filter((p) => !belongsToCoop(p)),
    prestacoesContasExcluidas: (data.prestacoesContasExcluidas ?? []).filter((e) => !belongsToCoop(e)),
    comunicados: data.comunicados.filter((c) => !belongsToCoop(c)),
    reclamacoes: (data.reclamacoes ?? []).filter((r) => r.cooperativaId !== coopId),
  };
}

export interface CloudOperationalResetSignal {
  operationalResetVersion?: number;
  fullReset?: boolean;
  wipeNotas?: boolean;
}

/** Aplica reset publicado na nuvem (fullReset) no aparelho — uma vez por versão/CNPJ. */
export function applyCloudOperationalResetIfNeeded(
  data: AppData,
  cnpj: string,
  coopId: string,
  cloud: CloudOperationalResetSignal
): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };
  if (!cloud.fullReset) return { data, changed: false };

  const digits = normalizeCnpj(cnpj);
  const cloudVer = cloud.operationalResetVersion ?? 0;
  if (cloudVer <= 0) return { data, changed: false };
  if (getCloudResetAppliedVersion(digits) >= cloudVer) return { data, changed: false };

  markCloudResetApplied(digits, cloudVer);
  clearNotasSyncMeta(digits);
  return { data: clearOperationalDataForCooperativa(data, coopId), changed: true };
}

export function applyOperationalResetIfNeeded(data: AppData): { data: AppData; changed: boolean } {
  if (typeof window === "undefined") return { data, changed: false };

  const stored = localStorage.getItem(OPERATIONAL_RESET_STORAGE_KEY);
  if (stored === String(OPERATIONAL_RESET_VERSION)) return { data, changed: false };

  localStorage.setItem(OPERATIONAL_RESET_STORAGE_KEY, String(OPERATIONAL_RESET_VERSION));
  markOperationalResetCloudPending();
  return { data: clearOperationalData(data), changed: true };
}
