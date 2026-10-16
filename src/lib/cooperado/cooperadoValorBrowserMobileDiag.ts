/**
 * Diagnóstico read-only — por que browser e mobile podem mostrar valores diferentes.
 * Exposto só para o cooperado piloto Jeferson (`isCooperadoMobilePilot`).
 */
import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";
import { buildCooperadoFinanceiroParidadeProbe } from "@/lib/cooperado/cooperadoFinanceiroParidadeProbe";
import { getData, isAppDataWarm } from "@/services/dataStore";

export const COOPERADO_VALOR_BROWSER_MOBILE_DIAG_VERSION = "hb-valores-browser-vs-mobile-v1";

const SESSION_KEY = "coopeagriplla_session";
const DATA_KEY = "coopeagriplla_data";
const OP_SYNC_BUILD = "hb-coop-operacional-synced-build";
const PWA_SNAP_BUILD = "hb-coop-pwa-snapshots-materialized-build";
const BUILD_SEEN = "hb-coop-app-build-seen";

export type CooperadoValorBrowserMobileDiag = {
  schema: string;
  quando: string;
  href: string;
  dispositivo: {
    standalone: boolean;
    mobile: boolean;
    online: boolean;
    ua: string;
  };
  release: {
    paginaBuild: number;
    paginaDpl: string | null;
    pageRelease: unknown;
    nuvem: Record<string, unknown> | null;
  };
  conta: { cooperadoId: string; cooperativaId: string; email?: string };
  appData: {
    kb: number;
    temDados: boolean;
    /** true se o inline warm já parseou AppData no window. */
    appDataParsedEarly: boolean;
    fichaPendenteRough: { linhas: number; soma: number } | null;
  };
  storageFlags: {
    operacionalSyncedBuild: number;
    pwaSnapshotsMaterializedBuild: number;
    buildSeen: number;
  };
  cachesValor: {
    inicioCards: SnapRow[];
    pwaInicio: SnapRow[];
    pwaFicha: SnapRow[];
    hbAccounts: SnapRow[];
  };
  motorApp: ReturnType<typeof buildCooperadoFinanceiroParidadeProbe>;
  causasProvaveis: string[];
  proximoPasso: string;
};

type SnapRow = {
  key: string;
  appBuild: number | null;
  savedAt: string | null;
  valorCard: number | null;
  mesCard: string | null;
  valorInicioDash: number | null;
  limiteHbDisponivel: number | null;
  limiteHbLiberado: number | null;
};

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function roughFichaPendente(data: ReturnType<typeof getData> | null, cid: string) {
  if (!data || !cid) return null;
  let sum = 0;
  let n = 0;
  for (const f of data.fichaCorrida || []) {
    if (f.cooperadoId !== cid) continue;
    if (f.status !== "pendente") continue;
    sum += Number(f.valorLiquido ?? 0);
    n++;
  }
  return { linhas: n, soma: sum };
}

function readSnaps(prefix: string, cooperadoId: string): SnapRow[] {
  if (typeof localStorage === "undefined") return [];
  const out: SnapRow[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.includes(prefix)) continue;
    if (cooperadoId && !k.endsWith(":" + cooperadoId) && !k.includes(":" + cooperadoId + ":")) {
      if (!k.includes(":" + cooperadoId)) continue;
    }
    const o = safeJson(localStorage.getItem(k)) as Record<string, unknown> | null;
    if (!o) continue;
    const display = o.display as { valor?: number; mesLabel?: string } | undefined;
    const view = o.view as {
      valorReceber?: { valor?: number; valorExibicao?: number };
    };
    const paridade = o.paridade as { valorLiquido?: number } | undefined;
    const account = o.account as {
      valorDisponivelCents?: number;
      limiteLiberadoCents?: number;
    } | null;
    out.push({
      key: k,
      appBuild: (o.appBuild as number) ?? (view as { appBuild?: number })?.appBuild ?? null,
      savedAt: (o.savedAt as string) ?? null,
      valorCard: display?.valor ?? null,
      mesCard: display?.mesLabel ?? null,
      valorInicioDash:
        view?.valorReceber?.valor ?? view?.valorReceber?.valorExibicao ?? paridade?.valorLiquido ?? null,
      limiteHbDisponivel: account?.valorDisponivelCents ?? null,
      limiteHbLiberado: account?.limiteLiberadoCents ?? null,
    });
  }
  return out;
}

export function canUseCooperadoValorBrowserMobileDiag(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoMobilePilot(user);
}

export async function buildCooperadoValorBrowserMobileDiag(
  user: Omit<User, "password"> | null | undefined
): Promise<CooperadoValorBrowserMobileDiag | null> {
  if (!canUseCooperadoValorBrowserMobileDiag(user) || typeof window === "undefined") return null;

  const pageBuild = parseInt(document.documentElement.getAttribute("data-app-build") || "0", 10) || 0;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mobile = window.matchMedia("(max-width: 1023px)").matches;

  let nuvem: Record<string, unknown> | null = null;
  try {
    const r = await fetch("/api/client-release?_=" + Date.now(), { cache: "no-store" });
    nuvem = r.ok ? ((await r.json()) as Record<string, unknown>) : { http: r.status };
  } catch (e) {
    nuvem = { erro: String(e) };
  }
  const cloudBuild = Number(nuvem?.build || 0);

  const sess = safeJson(localStorage.getItem(SESSION_KEY)) as {
    user?: { cooperadoId?: string; cooperativaId?: string; email?: string };
    cooperadoId?: string;
    cooperativaId?: string;
    email?: string;
  } | null;
  const sessUser = sess?.user ?? sess;
  const cooperadoId = String(sessUser?.cooperadoId ?? user?.cooperadoId ?? "").trim();
  const cooperativaId = String(sessUser?.cooperativaId ?? user?.cooperativaId ?? "").trim();

  const appDataRaw = localStorage.getItem(DATA_KEY);
  const appDataKb = appDataRaw ? Math.round((appDataRaw.length * 2) / 1024) : 0;
  const appData = isAppDataWarm() ? getData() : null;
  const w = window as Window & { __hbCoopParsedAppData?: unknown };
  const parsedEarly = Boolean(w.__hbCoopParsedAppData);

  const inicioCards = readSnaps("hb.coop.inicioCard", cooperadoId);
  const pwaInicio = readSnaps("hb.coop.pwaInicioDash", cooperadoId);
  const pwaFicha = readSnaps("hb.coop.pwaFichaResumo", cooperadoId);
  const hbAccounts = readSnaps("hb.coop.hbCreditAccount", cooperadoId);

  const operSync = Number(localStorage.getItem(OP_SYNC_BUILD) || 0);
  const pwaMatBuild = Number(localStorage.getItem(PWA_SNAP_BUILD) || 0);
  const buildSeen = Number(localStorage.getItem(BUILD_SEEN) || 0);

  const motorApp = buildCooperadoFinanceiroParidadeProbe(user);

  const causas: string[] = [];
  if (cloudBuild && pageBuild && pageBuild < cloudBuild) {
    causas.push(`PAGINA_ATRAS_NUVEM: HTML build ${pageBuild} < produção ${cloudBuild}`);
  }
  if (cloudBuild && buildSeen && buildSeen < cloudBuild) {
    causas.push(`PERFIL_PWA_ANTIGO: buildSeen ${buildSeen} < produção ${cloudBuild}`);
  }
  if (cloudBuild && operSync && operSync < cloudBuild) {
    causas.push(
      `OPERACIONAL_NAO_SYNC_NO_BUILD: ${operSync} < ${cloudBuild} (AppData pode estar velho no celular)`
    );
  }
  if ((standalone || mobile) && appDataKb > 20 && !parsedEarly && !isAppDataWarm()) {
    causas.push(
      "MOBILE_PWA_ADIA_PARSE_APPDATA: localStorage grande mas AppData ainda não warm — UI pode usar snapshot/cache antigo"
    );
  }
  for (const c of inicioCards) {
    if (c.appBuild && pageBuild && c.appBuild !== pageBuild) {
      causas.push(
        `INICIO_CARD_BUILD_ERRADO: cache build ${c.appBuild} ≠ página ${pageBuild} (card ignorado → pode zerar no mobile)`
      );
    }
    if (
      c.valorCard != null &&
      motorApp &&
      Math.abs(c.valorCard - motorApp.paridade.valorLiquido) > 0.02
    ) {
      causas.push(
        `CARD_CACHE_VS_MOTOR: cache ${c.valorCard} ≠ paridade ${motorApp.paridade.valorLiquido}`
      );
    }
  }
  if (!motorApp && appData && cooperadoId) {
    const rough = roughFichaPendente(appData, cooperadoId);
    const cacheVal = inicioCards[0]?.valorCard ?? pwaInicio[0]?.valorInicioDash;
    if (rough && rough.soma > 0.01 && (cacheVal == null || cacheVal === 0)) {
      causas.push(
        `APPDATA_TEM_FICHA_PENDENTE (${rough.soma.toFixed(2)}) MAS_CACHE_MOSTRA_${cacheVal ?? "VAZIO"}`
      );
    }
  }
  if (standalone && /Edg\//i.test(navigator.userAgent)) {
    causas.push("EDGE_NO_CELULAR: cache separado do Chrome — compare com Chrome, não Edge");
  }
  if (navigator.serviceWorker?.controller) {
    causas.push("SERVICE_WORKER_ATIVO: se build/DPL misturados, browser e PWA divergem");
  }

  return {
    schema: COOPERADO_VALOR_BROWSER_MOBILE_DIAG_VERSION,
    quando: new Date().toISOString(),
    href: location.href,
    dispositivo: { standalone, mobile, online: navigator.onLine, ua: navigator.userAgent },
    release: {
      paginaBuild: pageBuild,
      paginaDpl: document.documentElement.getAttribute("data-dpl-id"),
      pageRelease: (window as Window & { __HB_PAGE_RELEASE__?: unknown }).__HB_PAGE_RELEASE__ ?? null,
      nuvem,
    },
    conta: { cooperadoId, cooperativaId, email: sessUser?.email ?? user?.email },
    appData: {
      kb: appDataKb,
      temDados: Boolean(appDataRaw),
      appDataParsedEarly: parsedEarly,
      fichaPendenteRough: roughFichaPendente(appData, cooperadoId),
    },
    storageFlags: {
      operacionalSyncedBuild: operSync,
      pwaSnapshotsMaterializedBuild: pwaMatBuild,
      buildSeen,
    },
    cachesValor: { inicioCards, pwaInicio, pwaFicha, hbAccounts },
    motorApp,
    causasProvaveis: causas.length
      ? causas
      : ["Nenhuma causa óbvia — compare este JSON com o do outro aparelho linha a linha."],
    proximoPasso:
      "Rode no PC e no celular; compare release.nuvem.build, cachesValor, appData e causasProvaveis.",
  };
}

export type CooperadoValorDiagHandle = {
  run: () => Promise<CooperadoValorBrowserMobileDiag | null>;
  print: () => Promise<CooperadoValorBrowserMobileDiag | null>;
  copyJson: () => Promise<string>;
  last: CooperadoValorBrowserMobileDiag | null;
};

export function installCooperadoValorBrowserMobileDiag(
  user: Omit<User, "password"> | null | undefined
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as Window & {
    __hbCoopValorDiag?: CooperadoValorDiagHandle;
    __HB_COOP_VALOR_DIAG__?: CooperadoValorBrowserMobileDiag | null;
  };

  if (!canUseCooperadoValorBrowserMobileDiag(user)) {
    delete w.__hbCoopValorDiag;
    delete w.__HB_COOP_VALOR_DIAG__;
    return () => undefined;
  }

  let last: CooperadoValorBrowserMobileDiag | null = null;

  const handle: CooperadoValorDiagHandle = {
    last: null,
    run: async () => {
      const report = await buildCooperadoValorBrowserMobileDiag(user);
      last = report;
      handle.last = report;
      w.__HB_COOP_VALOR_DIAG__ = report;
      return report;
    },
    print: async () => {
      const report = await handle.run();
      if (report) {
        console.info("[HB Jeferson] Diagnóstico browser vs mobile (valores)");
        console.table({
          cloudBuild: report.release.nuvem?.build ?? "—",
          pageBuild: report.release.paginaBuild,
          standalone: report.dispositivo.standalone,
          mobile: report.dispositivo.mobile,
          appDataKb: report.appData.kb,
          cardValor: report.cachesValor.inicioCards[0]?.valorCard ?? "—",
          paridade: report.motorApp?.paridade.valorLiquido ?? "—",
          causa: report.causasProvaveis[0] ?? "—",
        });
        console.log(report);
      }
      return report;
    },
    copyJson: async () => {
      const report = await handle.run();
      const text = JSON.stringify(report, null, 2);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* ignore */
      }
      return text;
    },
  };

  w.__hbCoopValorDiag = handle;

  console.info(
    "[HB Jeferson] Diagnóstico valores: await __hbCoopValorDiag.print() — ou toque em «Diag» no canto da tela."
  );

  return () => {
    delete w.__hbCoopValorDiag;
    delete w.__HB_COOP_VALOR_DIAG__;
  };
}
