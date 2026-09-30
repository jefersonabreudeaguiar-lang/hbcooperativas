/**
 * BIC-D1 — coletor read-only do aparelho (browser).
 * Somente getItem / JSON.parse / indexedDB.databases().
 * Não persiste, não envia ao servidor, não muta estado.
 */
import {
  BIC_D1_AUTHORIZED_COOPERADO_ID,
  BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ,
} from "@/lib/security/bicD1DiagnosticAccess";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import type { AppData } from "@/types";

const APPDATA_KEY = "coopeagriplla_data";
const SYNC_META_KEY = "hb_sync_meta_v1";
const SESSION_KEY = "coopeagriplla_session";

/** Cooperativa de referência do diagnóstico Jeferson (artefatos locais). */
export const BIC_D1_DIAGNOSTIC_COOPERATIVA_ID = "06342dae-8191-4193-94b6-d0be3a82e10b";

const LS_KEY_PATTERN =
  /sync|operacional|coopeagri|hb_|bic|projec|ficha|pagamento|recibo|credito|credit|cache|meta|session/i;

export function isBicD1EligibilityAllowsCapture(httpStatus: number): boolean {
  return httpStatus === 200;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^data:image\//i.test(value) || /^data:application\//i.test(value)) {
      return `[DATA_URL_OMITIDA_LEN_${value.length}]`;
    }
    if (value.length > 800) {
      return `[STRING_OMITIDA_LEN_${value.length}]`;
    }
    if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) {
      return "[JWT_OMITIDO]";
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    if (/password|token|secret|authorization|pin_hash|pinHash|refresh/i.test(k)) {
      out[k] = "[OMITIDO]";
      continue;
    }
    if (k === "reciboHtml" || k === "assinaturaCooperado" || k === "assinaturaDataUrl") {
      const v = (value as Record<string, unknown>)[k];
      out[k] = v ? "[HTML_OU_ASSINATURA_OMITIDA]" : v;
      continue;
    }
    out[k] = sanitizeValue((value as Record<string, unknown>)[k], depth + 1);
  }
  return out;
}

function pick<T extends Record<string, unknown>>(obj: T | null | undefined, fields: string[]): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, f)) {
      out[f] = sanitizeValue(obj[f], 0);
    }
  }
  return out;
}

function parseLsJson(key: string): {
  exists: boolean;
  rawLength: number;
  parsed: unknown | null;
  parseError?: string;
} {
  if (typeof window === "undefined") {
    return { exists: false, rawLength: 0, parsed: null };
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return { exists: false, rawLength: 0, parsed: null };
    const parsed = JSON.parse(raw) as unknown;
    return { exists: true, rawLength: raw.length, parsed };
  } catch (e) {
    const raw = localStorage.getItem(key) || "";
    return {
      exists: true,
      rawLength: raw.length,
      parsed: null,
      parseError: String(e instanceof Error ? e.message : e),
    };
  }
}

function readSessionMeta(): {
  cooperadoId?: string;
  cooperativaId?: string;
  cooperativaCnpj?: string;
} | null {
  const block = parseLsJson(SESSION_KEY);
  if (!block.parsed || typeof block.parsed !== "object") return null;
  const p = block.parsed as Record<string, unknown>;
  return {
    cooperadoId: typeof p.cooperadoId === "string" ? p.cooperadoId : undefined,
    cooperativaId: typeof p.cooperativaId === "string" ? p.cooperativaId : undefined,
    cooperativaCnpj: typeof p.cooperativaCnpj === "string" ? p.cooperativaCnpj : undefined,
  };
}

function listLocalStorageKeys(): string[] {
  const keys: string[] = [];
  if (typeof window === "undefined") return keys;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return keys;
  }
  return keys;
}

function summarizeLsKey(key: string): Record<string, unknown> {
  if (typeof window === "undefined") return { key, error: "no_window" };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    return { key, error: String(e) };
  }
  if (raw == null) return { key, exists: false };
  const meta: Record<string, unknown> = { key, exists: true, byteLength: raw.length };
  if (key === SESSION_KEY || /session|jwt|auth/i.test(key)) {
    meta.preview = "[SECRETO_NAO_EXPORTADO]";
    return meta;
  }
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    meta.json = true;
    meta.topLevelKeys = Object.keys(p).slice(0, 80);
    if (key === SYNC_META_KEY && p.notas && typeof p.notas === "object") {
      const notas = p.notas as Record<string, unknown>;
      const coop = notas[BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ];
      if (coop) meta.coopMeta62351750000165 = sanitizeValue(coop, 0);
    }
  } catch {
    meta.json = false;
    meta.preview = raw.slice(0, 120);
  }
  return meta;
}

function countFotosNota(nota: Record<string, unknown> | null | undefined): number {
  if (!nota) return 0;
  let n = 0;
  if (Array.isArray(nota.fotosPedido)) n = Math.max(n, nota.fotosPedido.length);
  if (Array.isArray(nota.fotos)) n = Math.max(n, nota.fotos.length);
  if (nota.fotosEnviadasCount != null) n = Math.max(n, Number(nota.fotosEnviadasCount) || 0);
  return n;
}

function resolvePlataforma(): "DESKTOP" | "MOBILE" | "INDETERMINADO" {
  if (typeof window === "undefined") return "INDETERMINADO";
  return isMobileCooperativaApp() ? "MOBILE" : "DESKTOP";
}

function collectSyncMeta(): Record<string, unknown> {
  const block = parseLsJson(SYNC_META_KEY);
  if (!block.exists || !block.parsed) {
    return {
      hb_sync_meta_v1_exists: block.exists,
      coopMeta: null,
      note: block.parseError || "meta ausente ou ilegível",
    };
  }
  const meta = block.parsed as Record<string, unknown>;
  const notas = meta.notas as Record<string, unknown> | undefined;
  const coop = notas?.[BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ] as Record<string, unknown> | undefined;
  const cursor =
    coop?.lastServerUpdatedAt != null
      ? coop.lastServerUpdatedAt
      : coop?.lastNotasAt != null
        ? coop.lastNotasAt
        : null;
  return {
    hb_sync_meta_v1_exists: true,
    rawLength: block.rawLength,
    coopMeta62351750000165: sanitizeValue(coop, 0),
    cursorEfetivo: cursor,
    lastNotasAt: coop?.lastNotasAt,
    lastServerUpdatedAt: coop?.lastServerUpdatedAt,
    lastFullNotasAt: coop?.lastFullNotasAt,
  };
}

function collectCooperadoScope(appData: AppData | null, cooperadoId: string) {
  if (!appData) {
    return { appDataPresent: false as const };
  }

  const cooperados = appData.cooperados ?? [];
  const notas = appData.notasPedido ?? [];
  const ficha = appData.fichaCorrida ?? [];
  const pagamentos = appData.pagamentosCooperado ?? [];
  const arquivos = appData.arquivosMensais ?? [];

  const cooperado = cooperados.find((c) => c.id === cooperadoId);

  const notasCoop = notas.filter((n) => n.cooperadoId === cooperadoId);
  const fichaCoop = ficha.filter((f) => f.cooperadoId === cooperadoId);
  const pagamentosCoop = pagamentos.filter((p) => p.cooperadoId === cooperadoId);
  const arquivosCoop = arquivos.filter((a) => a.cooperadoId === cooperadoId);

  const notaFields = [
    "id",
    "status",
    "cooperadoId",
    "createdAt",
    "updatedAt",
    "serverUpdatedAt",
    "mesReferencia",
    "numero",
    "numeroNota",
    "valorBruto",
    "valorLiquido",
    "fotoNaNuvem",
    "fotosEnviadasCount",
  ];

  return {
    appDataPresent: true as const,
    appDataTopKeys: Object.keys(appData).slice(0, 120),
    counts: {
      cooperadosTotal: cooperados.length,
      notasPedidoTotal: notas.length,
      fichaCorridaTotal: ficha.length,
      pagamentosCooperadoTotal: pagamentos.length,
      arquivosMensaisTotal: arquivos.length,
      cooperativasTotal: (appData.cooperativas ?? []).length,
      usersTotal: (appData.users ?? []).length,
      notasCooperado: notasCoop.length,
      fichaCooperado: fichaCoop.length,
      pagamentosCooperado: pagamentosCoop.length,
      arquivosMensaisCooperado: arquivosCoop.length,
    },
    cooperado: cooperado
      ? pick(cooperado as unknown as Record<string, unknown>, [
          "id",
          "nomeCompleto",
          "cooperativaId",
          "status",
          "ativo",
        ])
      : null,
    notasCooperado: notasCoop.map((n) => {
      const row = pick(n as unknown as Record<string, unknown>, notaFields);
      if (row) row.quantidadeFotos = countFotosNota(n as unknown as Record<string, unknown>);
      return row;
    }),
    fichaCooperado: fichaCoop.map((f) =>
      pick(f as unknown as Record<string, unknown>, [
        "id",
        "notaPedidoId",
        "status",
        "valorBruto",
        "descontos",
        "valorLiquido",
        "saldoAcumulado",
        "dataLancamento",
        "dataPagamentoPrevista",
        "createdAt",
        "updatedAt",
      ])
    ),
    pagamentosCooperado: pagamentosCoop.map((p) =>
      pick(p as unknown as Record<string, unknown>, [
        "id",
        "status",
        "valorBruto",
        "valorLiquido",
        "descontoCooperativa",
        "fichaIds",
        "notaPedidoIds",
        "pagoEm",
        "pagoPor",
        "assinadoEm",
        "createdAt",
        "updatedAt",
        "reciboConferidoPorResponsavelEm",
      ])
    ),
    arquivosMensaisCooperado: arquivosCoop.map((a) => ({
      resumo: pick(a as unknown as Record<string, unknown>, [
        "id",
        "mesReferencia",
        "mensalidadeFixa",
        "descontoAvulso",
        "contaCoopDescontosUpdatedAt",
        "updatedAt",
      ]),
      contaCoopDescontosCount: Array.isArray(a.contaCoopDescontos) ? a.contaCoopDescontos.length : 0,
    })),
  };
}

async function inspectIndexedDB(): Promise<Record<string, unknown>> {
  if (typeof indexedDB === "undefined") {
    return { status: "INDETERMINADO — indexedDB indisponível" };
  }
  if (typeof indexedDB.databases !== "function") {
    return {
      status: "INDETERMINADO — indexedDB.databases() não disponível; sem abrir stores",
    };
  }
  try {
    const dbs = await indexedDB.databases();
    return {
      databases: (dbs ?? []).map((d) => ({ name: d.name, version: d.version })),
      note: "Somente nomes/version — stores não inspecionadas (read-only).",
    };
  } catch (e) {
    return { status: `INDETERMINADO — ${String(e)}` };
  }
}

export type BicD1CaptureResult = {
  meta: {
    ticket: "BIC-D1";
    capturedAt: string;
    plataforma: "DESKTOP" | "MOBILE" | "INDETERMINADO";
    userAgent: string | null;
    online: boolean | null;
    viewport: { width: number | null; height: number | null };
    appBuildVersion: number;
    identidade: {
      referenciaDiagnostico: {
        cooperadoId: string;
        cooperativaId: string;
        cnpj: string;
      };
      sessaoLocal?: {
        cooperadoId?: string;
        cooperativaId?: string;
        cooperativaCnpj?: string;
      };
    };
  };
  appData: ReturnType<typeof collectCooperadoScope>;
  localStorage: {
    totalKeys: number;
    relevantKeys: Record<string, unknown>[];
    coopeagriplla_data: {
      exists: boolean;
      byteLength: number;
      parseError?: string;
    };
  };
  syncMeta: Record<string, unknown>;
  indexedDB: Record<string, unknown>;
};

/** Fotografia read-only do aparelho — resultado só em memória. */
export async function captureBicD1Diagnostic(): Promise<BicD1CaptureResult> {
  if (typeof window === "undefined") {
    throw new Error("captureBicD1Diagnostic só pode executar no browser.");
  }

  const appBlock = parseLsJson(APPDATA_KEY);
  const appData =
    appBlock.parsed && typeof appBlock.parsed === "object"
      ? (appBlock.parsed as AppData)
      : null;

  const lsKeys = listLocalStorageKeys();
  const relevantKeys = lsKeys.filter((k) => LS_KEY_PATTERN.test(k)).map(summarizeLsKey);

  const sessionMeta = readSessionMeta();

  return {
    meta: {
      ticket: "BIC-D1",
      capturedAt: nowIso(),
      plataforma: resolvePlataforma(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      viewport: {
        width: typeof window !== "undefined" ? window.innerWidth : null,
        height: typeof window !== "undefined" ? window.innerHeight : null,
      },
      appBuildVersion: APP_BUILD_VERSION,
      identidade: {
        referenciaDiagnostico: {
          cooperadoId: BIC_D1_AUTHORIZED_COOPERADO_ID,
          cooperativaId: BIC_D1_DIAGNOSTIC_COOPERATIVA_ID,
          cnpj: BIC_D1_AUTHORIZED_COOPERATIVA_CNPJ,
        },
        sessaoLocal: sessionMeta ?? undefined,
      },
    },
    appData: collectCooperadoScope(appData, BIC_D1_AUTHORIZED_COOPERADO_ID),
    localStorage: {
      totalKeys: lsKeys.length,
      relevantKeys,
      coopeagriplla_data: {
        exists: appBlock.exists,
        byteLength: appBlock.rawLength,
        parseError: appBlock.parseError,
      },
    },
    syncMeta: collectSyncMeta(),
    indexedDB: await inspectIndexedDB(),
  };
}

/** Resumo para UI pós-captura. */
export function summarizeBicD1CaptureCounts(capture: BicD1CaptureResult): {
  capturedAt: string;
  notas: number;
  fichas: number;
  pagamentos: number;
  arquivosMensais: number;
} {
  const counts = capture.appData.appDataPresent ? capture.appData.counts : null;
  return {
    capturedAt: capture.meta.capturedAt,
    notas: counts?.notasCooperado ?? 0,
    fichas: counts?.fichaCooperado ?? 0,
    pagamentos: counts?.pagamentosCooperado ?? 0,
    arquivosMensais: counts?.arquivosMensaisCooperado ?? 0,
  };
}

/** Expõe sanitização para testes. */
export function sanitizeBicD1CaptureValue(value: unknown): unknown {
  return sanitizeValue(value, 0);
}
