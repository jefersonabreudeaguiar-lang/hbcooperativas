/**
 * H197/H198 — captura pareada read-only (ring buffer em memória, flag NEXT_PUBLIC_H197_CAPTURE=1).
 * Não persiste, não sincroniza, não muta AppData.
 */
import type { AppData, PagamentoCooperadoRegistro, User } from "@/types";
import { getData, getDataRevision, isAppDataWarm } from "@/services/dataStore";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  pagamentoCooperadoPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import {
  BIC_D13_ORLANDO_COOPERADO_ID,
  BIC_D13_REF_PG_ANTIGO,
  buildBicD13RuntimeCaptureFromAppData,
} from "@/lib/diagnostic/bicD13RuntimeCapture";

export const H197_ORLANDO_COOPERADO_ID = BIC_D13_ORLANDO_COOPERADO_ID;
export const H197_COOPERATIVA_CNPJ = "62351750000165";
export const H197_TARGET_PG_ID = BIC_D13_REF_PG_ANTIGO;

export const H197_LABELS = [
  "T0_PRE_WARM",
  "T1_WARM_PRE_SYNC",
  "T2_SYNCING",
  "T3_POST_HYDRATE",
  "T4_STEADY",
] as const;

export type H197Label = (typeof H197_LABELS)[number];

const RING_MAX = 10;

const SENSITIVE_KEYS = new Set([
  "password",
  "senha",
  "pin",
  "token",
  "jwt",
  "accessToken",
  "refreshToken",
  "reciboHtml",
  "assinaturaCooperado",
  "authorization",
  "cookie",
  "foto",
  "fotos",
  "documento",
  "documentos",
  "endereco",
  "telefone",
  "nomeCompleto",
  "email",
  "cpfCnpj",
  "chavePix",
]);

export type H197CaptureContext = {
  user: Omit<User, "password"> | null | undefined;
  cooperadoPagamentosHydrated: boolean;
  syncing: boolean;
  /** Opcional — testes Node passam AppData explícito. */
  dataOverride?: AppData | null;
};

export type H197Snapshot = {
  meta: {
    label: H197Label;
    capturedAt: string;
    userAgent: string | null;
    viewport: { width: number; height: number; devicePixelRatio: number } | null;
    pathname: string | null;
    online: boolean | null;
    mobileExperience: boolean | null;
    pwaStandalone: boolean | null;
    appBuild: string;
  };
  identidade: {
    cooperadoId: string | null;
    cooperativaId: string | null;
    cnpj: string | null;
    role: string | null;
  };
  provider: {
    cooperadoPagamentosHydrated: boolean;
    syncing: boolean;
    appDataWarm: boolean;
    dataRevision: number;
  };
  estado: {
    appDataPresent: boolean;
    notasTotal: number;
    fichasTotal: number;
    pagamentosTotal: number;
    arquivosMensaisTotal: number;
    pagamentosAguardandoOrlando: number;
    pagamentosConfirmadosOrlando: number;
  };
  orlando: {
    cooperadoPresente: boolean;
    notasOrlando: number;
    fichasOrlando: number;
    pagamentosOrlando: number;
    arquivosMensaisOrlando: number;
  };
  target: {
    pagamentoId: string;
    presente: boolean;
    status: PagamentoCooperadoRegistro["status"] | null;
    fichaIds: string[];
    notaPedidoIds: string[];
    valorBruto: number | null;
    valorLiquido: number | null;
    descontoCooperativa: number | null;
    pagoEm: string | null;
    updatedAt: string | null;
  };
  ciclos: {
    cicloAntigoPresente: boolean;
    cicloNovoPresente: boolean;
    cicloAntigo: {
      fichaIds: string[];
      fichaStatus: Record<string, string>;
      notaIds: string[];
      notaStatus: Record<string, string>;
      valorLiquidoFichas: number | null;
    };
    cicloNovo: {
      fichaIds: string[];
      fichaStatus: Record<string, string>;
      notaIds: string[];
      notaStatus: Record<string, string>;
      valorLiquidoFichas: number | null;
    };
  };
  projecao: {
    aguardandoAssinatura: boolean;
    valorRecibo: number;
    valorAberto: number;
    pagamentoAguardandoCooperadoId: string | null;
  };
};

export type H197ExportPayload = {
  meta: {
    ticket: "H197-PAREADO";
    exportedAt: string;
    captureEnabled: boolean;
    ringSize: number;
    appBuild: string;
  };
  T0: H197Snapshot | null;
  T1: H197Snapshot | null;
  T2: H197Snapshot | null;
  T3: H197Snapshot | null;
  T4: H197Snapshot | null;
};

let ring: H197Snapshot[] = [];
const latestByLabel = new Map<H197Label, H197Snapshot>();

export function isH197CaptureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_H197_CAPTURE === "1";
}

function resolveAppBuild(): string {
  const parts = [
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_ID,
    process.env.NEXT_PUBLIC_APP_VERSION,
  ].filter(Boolean);
  return parts.length ? parts.join(":") : "unknown";
}

function isPwaStandalone(): boolean | null {
  if (typeof window === "undefined") return null;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function browserMeta(): Pick<H197Snapshot["meta"], "userAgent" | "viewport" | "pathname" | "online" | "mobileExperience" | "pwaStandalone"> {
  if (typeof window === "undefined") {
    return {
      userAgent: null,
      viewport: null,
      pathname: null,
      online: null,
      mobileExperience: null,
      pwaStandalone: null,
    };
  }
  return {
    userAgent: navigator.userAgent,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio ?? 1,
    },
    pathname: window.location.pathname + window.location.search,
    online: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
    mobileExperience: isMobileCooperativaApp(),
    pwaStandalone: isPwaStandalone(),
  };
}

function resolveSessionCooperadoId(user: H197CaptureContext["user"]): string | null {
  if (!user) return null;
  return user.cooperadoId ?? null;
}

export function isH197OrlandoSession(user: H197CaptureContext["user"], cnpj: string | null): boolean {
  const cooperadoId = resolveSessionCooperadoId(user);
  if (cooperadoId !== H197_ORLANDO_COOPERADO_ID) return false;
  if (cnpj && cnpj.replace(/\D/g, "") !== H197_COOPERATIVA_CNPJ) return false;
  return true;
}

function readAppData(ctx: H197CaptureContext): AppData | null {
  if (ctx.dataOverride !== undefined) return ctx.dataOverride;
  try {
    return getData();
  } catch {
    return null;
  }
}

function countOrlandoArquivos(data: AppData, canonico: string, coopId: string | undefined): number {
  return (data.arquivosMensais ?? []).filter((a) => {
    const cid = (a as { cooperadoId?: string }).cooperadoId;
    return cid === canonico || cid === H197_ORLANDO_COOPERADO_ID;
  }).length;
}

function buildTargetSlice(pg: PagamentoCooperadoRegistro | undefined): H197Snapshot["target"] {
  if (!pg) {
    return {
      pagamentoId: H197_TARGET_PG_ID,
      presente: false,
      status: null,
      fichaIds: [],
      notaPedidoIds: [],
      valorBruto: null,
      valorLiquido: null,
      descontoCooperativa: null,
      pagoEm: null,
      updatedAt: null,
    };
  }
  return {
    pagamentoId: pg.id,
    presente: true,
    status: pg.status,
    fichaIds: [...(pg.fichaIds ?? [])],
    notaPedidoIds: [...(pg.notaPedidoIds ?? [])],
    valorBruto: pg.valorBruto,
    valorLiquido: pg.valorLiquido,
    descontoCooperativa: pg.descontoCooperativa,
    pagoEm: pg.pagoEm ?? null,
    updatedAt: pg.updatedAt ?? null,
  };
}

function buildCiclosDynamic(
  data: AppData,
  canonico: string,
  coopId: string | undefined,
  target: H197Snapshot["target"]
): H197Snapshot["ciclos"] {
  const oldFichaIds = new Set(target.fichaIds);
  const oldNotaIds = new Set(target.notaPedidoIds);

  const fichasOrlando = (data.fichaCorrida ?? []).filter((f) =>
    fichaPertenceCooperado(data, f, canonico, coopId)
  );

  const notasOrlando = (data.notasPedido ?? []).filter((n) =>
    notaPertenceCooperado(data, n, canonico, coopId)
  );

  const cicloAntigoFichas = fichasOrlando.filter((f) => oldFichaIds.has(f.id));
  const cicloAntigoNotas = notasOrlando.filter((n) => oldNotaIds.has(n.id));

  const cicloNovoFichas = fichasOrlando.filter(
    (f) => f.status === "pendente" && !oldFichaIds.has(f.id)
  );
  const cicloNovoNotaIds = new Set(cicloNovoFichas.map((f) => f.notaPedidoId).filter(Boolean));
  const cicloNovoNotas = notasOrlando.filter((n) => cicloNovoNotaIds.has(n.id));

  const mapStatus = <T extends { id: string; status: string }>(items: T[]) => {
    const out: Record<string, string> = {};
    for (const it of items) out[it.id] = it.status;
    return out;
  };

  const sumLiquido = (fichaIds: string[]) => {
    let sum = 0;
    let any = false;
    for (const id of fichaIds) {
      const f = fichasOrlando.find((x) => x.id === id);
      if (f) {
        sum += f.valorLiquido;
        any = true;
      }
    }
    return any ? sum : null;
  };

  return {
    cicloAntigoPresente: cicloAntigoFichas.length > 0 || cicloAntigoNotas.length > 0 || target.presente,
    cicloNovoPresente: cicloNovoFichas.length > 0 || cicloNovoNotas.length > 0,
    cicloAntigo: {
      fichaIds: cicloAntigoFichas.map((f) => f.id),
      fichaStatus: mapStatus(cicloAntigoFichas),
      notaIds: cicloAntigoNotas.map((n) => n.id),
      notaStatus: mapStatus(cicloAntigoNotas),
      valorLiquidoFichas: sumLiquido(cicloAntigoFichas.map((f) => f.id)),
    },
    cicloNovo: {
      fichaIds: cicloNovoFichas.map((f) => f.id),
      fichaStatus: mapStatus(cicloNovoFichas),
      notaIds: cicloNovoNotas.map((n) => n.id),
      notaStatus: mapStatus(cicloNovoNotas),
      valorLiquidoFichas: sumLiquido(cicloNovoFichas.map((f) => f.id)),
    },
  };
}

function sanitizeDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[REDACTED_DATA_URL]";
    if (value.length > 500 && /^eyJ/.test(value)) return "[REDACTED_JWT]";
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key] = sanitizeDeep(val);
  }
  return out;
}

export function buildH197Snapshot(label: H197Label, ctx: H197CaptureContext): H197Snapshot | null {
  const data = readAppData(ctx);
  const cooperadoId = resolveSessionCooperadoId(ctx.user);
  const coopIdFromUser = ctx.user?.cooperativaId ?? null;
  const cooperativa = data?.cooperativas?.find(
    (c) => c.id === coopIdFromUser || c.cnpj?.replace(/\D/g, "") === H197_COOPERATIVA_CNPJ
  );
  const coopId = cooperativa?.id ?? coopIdFromUser;
  const cnpj = cooperativa?.cnpj?.replace(/\D/g, "") ?? null;

  if (!isH197OrlandoSession(ctx.user, cnpj)) return null;

  const canonico =
    data && cooperadoId && coopId
      ? resolverCooperadoIdCanonico(data, cooperadoId, coopId)
      : cooperadoId ?? H197_ORLANDO_COOPERADO_ID;

  const pagamentosOrlando =
    data && cooperadoId
      ? (data.pagamentosCooperado ?? []).filter((p) =>
          pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, coopId ?? undefined)
        )
      : [];

  const pgTarget = pagamentosOrlando.find((p) => p.id === H197_TARGET_PG_ID);
  const target = buildTargetSlice(pgTarget);

  let projecao: H197Snapshot["projecao"] = {
    aguardandoAssinatura: false,
    valorRecibo: 0,
    valorAberto: 0,
    pagamentoAguardandoCooperadoId: null,
  };

  if (data && cooperadoId) {
    const bic = buildBicD13RuntimeCaptureFromAppData(data, H197_ORLANDO_COOPERADO_ID);
    projecao = {
      aguardandoAssinatura: bic.projecaoUiSomenteLeitura.aguardandoAssinatura,
      valorRecibo: bic.projecaoUiSomenteLeitura.valorRecibo,
      valorAberto: bic.projecaoUiSomenteLeitura.valorAberto,
      pagamentoAguardandoCooperadoId: bic.projecaoUiSomenteLeitura.pagamentoAguardandoCooperadoId,
    };
  }

  const notasOrlando =
    data && canonico
      ? (data.notasPedido ?? []).filter((n) => notaPertenceCooperado(data, n, canonico, coopId ?? undefined))
      : [];
  const fichasOrlando =
    data && canonico
      ? (data.fichaCorrida ?? []).filter((f) => fichaPertenceCooperado(data, f, canonico, coopId ?? undefined))
      : [];

  const snapshot: H197Snapshot = {
    meta: {
      label,
      capturedAt: new Date().toISOString(),
      appBuild: resolveAppBuild(),
      ...browserMeta(),
    },
    identidade: {
      cooperadoId: H197_ORLANDO_COOPERADO_ID,
      cooperativaId: coopId,
      cnpj: cnpj ? H197_COOPERATIVA_CNPJ : null,
      role: ctx.user?.role ?? null,
    },
    provider: {
      cooperadoPagamentosHydrated: ctx.cooperadoPagamentosHydrated,
      syncing: ctx.syncing,
      appDataWarm: data && typeof window !== "undefined" ? isAppDataWarm() : Boolean(data),
      dataRevision: data && typeof window !== "undefined" ? getDataRevision() : 0,
    },
    estado: {
      appDataPresent: Boolean(data),
      notasTotal: data?.notasPedido?.length ?? 0,
      fichasTotal: data?.fichaCorrida?.length ?? 0,
      pagamentosTotal: data?.pagamentosCooperado?.length ?? 0,
      arquivosMensaisTotal: data?.arquivosMensais?.length ?? 0,
      pagamentosAguardandoOrlando: pagamentosOrlando.filter((p) => p.status === "aguardando_confirmacao").length,
      pagamentosConfirmadosOrlando: pagamentosOrlando.filter((p) => p.status === "confirmado").length,
    },
    orlando: {
      cooperadoPresente: Boolean(data?.cooperados?.some((c) => c.id === H197_ORLANDO_COOPERADO_ID)),
      notasOrlando: notasOrlando.length,
      fichasOrlando: fichasOrlando.length,
      pagamentosOrlando: pagamentosOrlando.length,
      arquivosMensaisOrlando: data ? countOrlandoArquivos(data, canonico, coopId ?? undefined) : 0,
    },
    target,
    ciclos: data ? buildCiclosDynamic(data, canonico, coopId ?? undefined, target) : {
      cicloAntigoPresente: false,
      cicloNovoPresente: false,
      cicloAntigo: {
        fichaIds: [],
        fichaStatus: {},
        notaIds: [],
        notaStatus: {},
        valorLiquidoFichas: null,
      },
      cicloNovo: {
        fichaIds: [],
        fichaStatus: {},
        notaIds: [],
        notaStatus: {},
        valorLiquidoFichas: null,
      },
    },
    projecao,
  };

  return sanitizeDeep(snapshot) as H197Snapshot;
}

export function recordH197Snapshot(label: H197Label, snapshot: H197Snapshot): void {
  if (!isH197CaptureEnabled()) return;
  if (!H197_LABELS.includes(label)) return;
  latestByLabel.set(label, snapshot);
  ring.push(snapshot);
  if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
}

export function passiveH197Record(label: H197Label, ctx: H197CaptureContext): void {
  if (!isH197CaptureEnabled()) return;
  const built = buildH197Snapshot(label, ctx);
  if (!built) return;
  recordH197Snapshot(label, built);
}

export function exportH197PairedCapture(): H197ExportPayload {
  const pick = (label: H197Label) => latestByLabel.get(label) ?? null;
  return sanitizeDeep({
    meta: {
      ticket: "H197-PAREADO",
      exportedAt: new Date().toISOString(),
      captureEnabled: isH197CaptureEnabled(),
      ringSize: ring.length,
      appBuild: resolveAppBuild(),
    },
    T0: pick("T0_PRE_WARM"),
    T1: pick("T1_WARM_PRE_SYNC"),
    T2: pick("T2_SYNCING"),
    T3: pick("T3_POST_HYDRATE"),
    T4: pick("T4_STEADY"),
  }) as H197ExportPayload;
}

export function resetH197CaptureForTests(): void {
  ring = [];
  latestByLabel.clear();
}

export function getH197RingLengthForTests(): number {
  return ring.length;
}

declare global {
  interface Window {
    __H197_export?: () => H197ExportPayload;
  }
}

export function installH197WindowExport(): void {
  if (typeof window === "undefined") return;
  if (!isH197CaptureEnabled()) return;
  window.__H197_export = () => exportH197PairedCapture();
}

/** Chamado pelo CooperativaSyncProvider — observação passiva do lifecycle. */
export function h197ObserveLifecycleEvent(
  event:
    | "provider_mount_pre_warm"
    | "warm_pre_sync"
    | "syncing_start"
    | "hydrate_start"
    | "hydrate_end"
    | "run_sync_start"
    | "run_sync_end"
    | "steady_timer",
  ctx: H197CaptureContext
): void {
  if (!isH197CaptureEnabled()) return;
  switch (event) {
    case "provider_mount_pre_warm":
      passiveH197Record("T0_PRE_WARM", ctx);
      break;
    case "warm_pre_sync":
      passiveH197Record("T1_WARM_PRE_SYNC", ctx);
      break;
    case "syncing_start":
    case "hydrate_start":
      passiveH197Record("T2_SYNCING", ctx);
      break;
    case "hydrate_end":
    case "run_sync_end":
      passiveH197Record("T3_POST_HYDRATE", ctx);
      break;
    case "run_sync_start":
      passiveH197Record("T2_SYNCING", ctx);
      break;
    case "steady_timer":
      passiveH197Record("T4_STEADY", ctx);
      break;
    default:
      break;
  }
}
