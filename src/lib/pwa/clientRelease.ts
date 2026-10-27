import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import {
  buildInlineReleaseEpisodeGuardScript,
  MIXED_DPL_ALIGN_SESSION_KEY,
} from "@/lib/pwa/pwaReleaseConsistency";
import { parseDplFromAssetUrl } from "@/lib/pwa/vercelDeploymentId";
import { isCooperadoEntregaFlowActive } from "@/lib/cooperado/cooperadoEntregaFlowGuard";
import { buildInlineCooperadoPwaSilentRepairBlock } from "@/lib/pwa/cooperadoPwaSilentRepairInline";

/** Persistido após confirmar que o bundle carregado bate com o release oficial. */
export const DEPLOYMENT_SEEN_KEY = "hb-coop-app-deployment-seen";
export const BUILD_SEEN_KEY = "hb-coop-app-build-seen";
export const RELOAD_BURST_KEY = "hb-coop-release-reload-burst";
/** Evita rajada de align/reload seguidos (PWA cooperado). */
export const RELEASE_ALIGN_COOLDOWN_KEY = "hb-coop-release-align-at";
export const RELEASE_ALIGN_COOLDOWN_MS = 45_000;
/** Equipe: nova versão detectada — banner manual, sem reload automático. */
export const RELEASE_PENDING_STAFF_KEY = "hb-coop-release-pending-staff-build";
/** Evita segundo align na mesma sessão para o mesmo alvo. */
export const RELEASE_ALIGN_SESSION_KEY = "hb-coop-release-align-target";
/** Alvo de release que o shield deve alcançar antes de considerar o app atualizado. */
export const RELEASE_SHIELD_EXPECTED_KEY = "hb-coop-release-shield-expected";
/** Uma tentativa de align urgente por fingerprint (inline + shield). */
export const RELEASE_URGENT_ALIGN_FP_KEY = "hb-coop-release-urgent-align-fp";
export const URGENT_RELEASE_ALIGN_DEDUP_MS = 90_000;
/** Navegação recente por align de release — evita reload duplo do service worker. */
export const RELEASE_NAV_MARK_KEY = "hb-coop-release-nav";
export const RELEASE_NAV_MARK_GRACE_MS = 20_000;
/** PWA: não recarregar por troca de SW nos primeiros segundos após abrir o app. */
export const PWA_COLD_START_SW_RELOAD_GRACE_MS = 120_000;

export function isPwaColdStartWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const elapsed = performance.now();
    if (elapsed >= PWA_COLD_START_SW_RELOAD_GRACE_MS) return false;
    if (!nav) return elapsed < PWA_COLD_START_SW_RELOAD_GRACE_MS;
    return nav.type !== "reload";
  } catch {
    return true;
  }
}

/** Remove query de align da URL sem recarregar (evita re-checks e histórico poluído). */
export function stripReleaseAlignQueryFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("_hbRelease") && !u.searchParams.has("_hbTargetDpl")) return;
    u.searchParams.delete("_hbRelease");
    u.searchParams.delete("_hbTargetDpl");
    const next = u.pathname + u.search + u.hash;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}

export function shouldSkipServiceWorkerActivationReload(): boolean {
  if (typeof window === "undefined") return false;
  if (isPwaColdStartWindow()) return true;
  if (isCooperadoEntregaFlowActive()) return true;
  try {
    const now = Date.now();
    const nav = Number(sessionStorage.getItem(RELEASE_NAV_MARK_KEY) || 0);
    if (nav > 0 && now - nav < RELEASE_NAV_MARK_GRACE_MS) return true;
    const align = Number(sessionStorage.getItem(RELEASE_ALIGN_COOLDOWN_KEY) || 0);
    if (align > 0 && now - align < RELEASE_ALIGN_COOLDOWN_MS) return true;
    if (new URLSearchParams(window.location.search).has("_hbRelease")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Deployments com UI cooperado legada (recibo 123,42 / assinar recibo).
 * Qualquer chunk com estes IDs força reload — nunca permanecer neste runtime.
 */
export const BLOCKED_VERCEL_DEPLOYMENT_IDS: readonly string[] = [
  "dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ",
];

export type ClientReleaseInfo = {
  build: number;
  deploymentId: string;
  gitCommitSha: string;
};

export function getEmbeddedClientRelease(): ClientReleaseInfo {
  return {
    build: APP_BUILD_VERSION,
    deploymentId: (process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ?? "").trim(),
    gitCommitSha: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").trim(),
  };
}

export function getPageEmbeddedReleaseFromDom(): ClientReleaseInfo | null {
  if (typeof document === "undefined") return null;
  const w = window as Window & { __HB_PAGE_RELEASE__?: ClientReleaseInfo };
  if (w.__HB_PAGE_RELEASE__?.deploymentId) return w.__HB_PAGE_RELEASE__;
  const deploymentId = (document.documentElement.getAttribute("data-dpl-id") ?? "").trim();
  if (!deploymentId) return null;
  const buildRaw = (document.documentElement.getAttribute("data-app-build") ?? "").trim();
  const build = parseInt(buildRaw, 10);
  const gitCommitSha = (
    w.__HB_PAGE_RELEASE__?.gitCommitSha ??
    document.documentElement.getAttribute("data-git-sha") ??
    ""
  ).trim();
  return {
    build: Number.isFinite(build) ? build : 0,
    deploymentId,
    gitCommitSha,
  };
}

/** dpl=… em scripts/styles já parseados pelo navegador. */
export function collectLoadedDeploymentIdsFromDom(): string[] {
  if (typeof document === "undefined") return [];
  const ids = new Set<string>();
  const sel = 'script[src*="dpl="], link[href*="dpl="]';
  for (const el of document.querySelectorAll(sel)) {
    const url = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || "";
    const id = parseDplFromAssetUrl(url);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function getHtmlEmbeddedDeploymentId(): string {
  return getPageEmbeddedReleaseFromDom()?.deploymentId ?? "";
}

/** HTML + bundle JS em execução já são o release canônico (localStorage não entra aqui). */
export function runtimeAlreadyOnCanonicalRelease(
  canonical: ClientReleaseInfo,
  pageRelease: ClientReleaseInfo | null,
  embedded: ClientReleaseInfo = getEmbeddedClientRelease()
): boolean {
  if (embedded.build > 0 && embedded.build !== canonical.build) return false;
  const pageBuild = pageRelease?.build ?? 0;
  if (pageBuild > 0 && pageBuild !== canonical.build) return false;
  const effectiveBuild = pageBuild > 0 ? pageBuild : embedded.build;
  if (effectiveBuild !== canonical.build) return false;

  const canonSha = canonical.gitCommitSha.trim();
  const embSha = embedded.gitCommitSha.trim();
  if (canonSha && embSha && canonSha !== embSha) return false;
  const pageSha = (pageRelease?.gitCommitSha ?? "").trim();
  if (canonSha && pageSha && canonSha !== pageSha) return false;

  const canonDpl = canonical.deploymentId.trim();
  const embDpl = embedded.deploymentId.trim();
  const pageDpl = (pageRelease?.deploymentId ?? "").trim();
  if (canonDpl && embDpl && embDpl !== canonDpl) return false;
  if (canonDpl && pageDpl && pageDpl !== canonDpl) return false;
  if (!canonDpl) return true;
  if (!pageDpl && !embDpl) return true;
  return (pageDpl || embDpl) === canonDpl;
}

export function runtimeNeedsReleaseUpgrade(
  canonical: ClientReleaseInfo,
  pageRelease: ClientReleaseInfo | null,
  embedded: ClientReleaseInfo = getEmbeddedClientRelease()
): boolean {
  return !runtimeAlreadyOnCanonicalRelease(canonical, pageRelease, embedded);
}

export function releaseFingerprint(info: ClientReleaseInfo): string {
  return `${info.build}:${info.gitCommitSha.trim()}:${info.deploymentId.trim()}`;
}

export function persistReleaseShieldExpected(canonical: ClientReleaseInfo): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(RELEASE_SHIELD_EXPECTED_KEY, releaseFingerprint(canonical));
  } catch {
    /* ignore */
  }
}

export function clearReleaseShieldExpected(): void {
  try {
    sessionStorage?.removeItem(RELEASE_SHIELD_EXPECTED_KEY);
  } catch {
    /* ignore */
  }
}

export function readReleaseShieldExpected(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(RELEASE_SHIELD_EXPECTED_KEY);
  } catch {
    return null;
  }
}

/** Só confirma release após runtime bater com o alvo gravado pelo shield (se houver). */
export function releaseShieldSatisfied(
  canonical: ClientReleaseInfo,
  pageRelease: ClientReleaseInfo | null,
  embedded: ClientReleaseInfo = getEmbeddedClientRelease()
): boolean {
  if (runtimeNeedsReleaseUpgrade(canonical, pageRelease, embedded)) return false;
  const expected = readReleaseShieldExpected();
  if (!expected) return true;
  return releaseFingerprint(canonical) === expected;
}

/** Evita loop: no máximo um hardAlign urgente por fingerprint / 90s. */
export function allowUrgentReleaseAlignForFingerprint(fingerprint: string): boolean {
  const fp = fingerprint.trim();
  if (!fp) return true;
  if (typeof sessionStorage === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(RELEASE_URGENT_ALIGN_FP_KEY);
    const now = Date.now();
    const prev = raw ? (JSON.parse(raw) as { fp: string; t: number }) : null;
    if (prev && prev.fp === fp && now - prev.t < URGENT_RELEASE_ALIGN_DEDUP_MS) {
      return false;
    }
    sessionStorage.setItem(RELEASE_URGENT_ALIGN_FP_KEY, JSON.stringify({ fp, t: now }));
    return true;
  } catch {
    return true;
  }
}

export function clearUrgentReleaseAlignDedup(): void {
  try {
    sessionStorage?.removeItem(RELEASE_URGENT_ALIGN_FP_KEY);
  } catch {
    /* ignore */
  }
}

/** Build confirmado no localStorage só se bater com o bundle em execução. */
export function readConfirmedClientReleaseBuild(): number | null {
  if (typeof localStorage === "undefined") return null;
  const embeddedBuild = getEmbeddedClientRelease().build;
  try {
    const raw = localStorage.getItem(BUILD_SEEN_KEY);
    const n = raw != null ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n <= 0 || n !== embeddedBuild) return null;
    return n;
  } catch {
    return null;
  }
}

export function localPersistedBuildBehindCanonical(canonical: ClientReleaseInfo): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const embeddedBuild = getEmbeddedClientRelease().build;
    if (embeddedBuild > 0 && embeddedBuild >= canonical.build) {
      return false;
    }
    const raw = localStorage.getItem(BUILD_SEEN_KEY);
    const seen = raw != null ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(seen) || seen <= 0) return false;
    return canonical.build > seen;
  } catch {
    return false;
  }
}

export function runtimeBundleBehindCanonical(
  canonical: ClientReleaseInfo,
  embedded: ClientReleaseInfo = getEmbeddedClientRelease()
): boolean {
  return embedded.build > 0 && embedded.build !== canonical.build;
}

/** Após bloquear reload em loop, sincroniza marcadores com o runtime atual. */
export function markCurrentRuntimeReleaseSeen(): void {
  if (typeof localStorage === "undefined") return;
  const page = getPageEmbeddedReleaseFromDom();
  const embedded = getEmbeddedClientRelease();
  const build = embedded.build > 0 ? embedded.build : (page?.build ?? embedded.build);
  const dpl = (embedded.deploymentId || page?.deploymentId || "").trim();
  try {
    localStorage.setItem(BUILD_SEEN_KEY, String(build));
    if (dpl) localStorage.setItem(DEPLOYMENT_SEEN_KEY, dpl);
    clearReloadBurstCounter();
  } catch {
    /* ignore */
  }
}

export type DeploymentGuardDecision =
  | { action: "ok"; reason: string; target: ClientReleaseInfo }
  | { action: "pending"; reason: string }
  | { action: "align"; reason: string; hard: boolean };

function hasBlockedDeployment(ids: string[]): string | null {
  for (const id of ids) {
    if (BLOCKED_VERCEL_DEPLOYMENT_IDS.includes(id)) return id;
  }
  return null;
}

/**
 * Alinha runtime ao release canônico (GET /api/client-release = produção atual na Vercel).
 * HTML, scripts e API devem usar o mesmo deploymentId.
 */
export function evaluateClientReleaseAlignment(input: {
  canonical: ClientReleaseInfo;
  pageRelease: ClientReleaseInfo | null;
  loadedDeploymentIds: string[];
}): DeploymentGuardDecision {
  const target = input.canonical;
  const targetId = target.deploymentId.trim();
  const loaded = input.loadedDeploymentIds.filter(Boolean);
  const pageId = (input.pageRelease?.deploymentId ?? "").trim();
  const pageBuild = input.pageRelease?.build ?? 0;

  if (pageBuild > 0 && pageBuild !== target.build) {
    return {
      action: "align",
      reason: `page_build:${pageBuild}!=${target.build}`,
      hard: false,
    };
  }

  const blockedLoaded = hasBlockedDeployment(loaded);
  if (blockedLoaded) {
    return { action: "align", reason: `blocked_deployment:${blockedLoaded}`, hard: true };
  }
  if (pageId && hasBlockedDeployment([pageId])) {
    return { action: "align", reason: `blocked_page:${pageId}`, hard: true };
  }

  if (!targetId) {
    return { action: "ok", reason: "deployment_id_unset", target };
  }

  if (loaded.length === 0) {
    return { action: "pending", reason: "no_dpl_in_dom_yet" };
  }

  const chunksAligned = loaded.every((id) => id === targetId);
  const pageAligned = !pageId || pageId === targetId;

  if (chunksAligned && pageAligned) {
    return { action: "ok", reason: "fully_aligned", target };
  }

  if (!pageAligned) {
    return {
      action: "align",
      reason: `page_dpl:${pageId}!=${targetId}`,
      hard: false,
    };
  }

  return {
    action: "align",
    reason: `chunks:${loaded.join(",")}!=${targetId}`,
    hard: false,
  };
}

/** @deprecated use evaluateClientReleaseAlignment */
export function evaluateDeploymentGuard(input: {
  official: ClientReleaseInfo;
  loadedDeploymentIds: string[];
  htmlDeploymentId?: string | null;
}): DeploymentGuardDecision {
  return evaluateClientReleaseAlignment({
    canonical: input.official,
    pageRelease: input.htmlDeploymentId
      ? { build: 0, deploymentId: input.htmlDeploymentId, gitCommitSha: "" }
      : getPageEmbeddedReleaseFromDom(),
    loadedDeploymentIds: input.loadedDeploymentIds,
  });
}

const MAX_RELOADS_PER_MINUTE = 5;

export function shouldAllowHardReload(
  reason: string,
  options?: { bypassBurstForBuildUpgrade?: boolean }
): boolean {
  if (isCooperadoEntregaFlowActive()) return false;
  if (options?.bypassBurstForBuildUpgrade) return true;
  if (typeof sessionStorage === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(RELOAD_BURST_KEY);
    const now = Date.now();
    let entries: { t: number; r: string }[] = raw ? (JSON.parse(raw) as { t: number; r: string }[]) : [];
    entries = entries.filter((e) => now - e.t < 60_000);
    if (entries.length >= MAX_RELOADS_PER_MINUTE) return false;
    entries.push({ t: now, r: reason });
    sessionStorage.setItem(RELOAD_BURST_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return true;
  }
}

export function clearReloadBurstCounter(): void {
  try {
    sessionStorage.removeItem(RELOAD_BURST_KEY);
  } catch {
    /* ignore */
  }
}

export function markStaffReleasePending(build: number): void {
  if (typeof localStorage === "undefined" || !Number.isFinite(build) || build <= 0) return;
  try {
    localStorage.setItem(RELEASE_PENDING_STAFF_KEY, String(build));
  } catch {
    /* ignore */
  }
}

export function readStaffReleasePendingBuild(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(RELEASE_PENDING_STAFF_KEY);
    if (raw == null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function clearStaffReleasePendingIfMatches(build: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(RELEASE_PENDING_STAFF_KEY) === String(build)) {
      localStorage.removeItem(RELEASE_PENDING_STAFF_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** PWA instalado: alinha sozinho. Aba do Chrome do responsável: sem reload forçado (tela branca). */
export function shouldAutoAlignClientRelease(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function releaseAlignSessionTarget(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(RELEASE_ALIGN_SESSION_KEY);
  } catch {
    return null;
  }
}

function markReleaseAlignSessionTarget(target: string): void {
  try {
    sessionStorage?.setItem(RELEASE_ALIGN_SESSION_KEY, target);
  } catch {
    /* ignore */
  }
}

/** Chaves de align/release presas — cooperado PWA após purge global de cache UI. */
export function clearCooperadoReleaseAlignLocalKeys(): void {
  const keys = [
    RELEASE_ALIGN_COOLDOWN_KEY,
    RELEASE_ALIGN_SESSION_KEY,
    RELEASE_NAV_MARK_KEY,
    RELOAD_BURST_KEY,
    RELEASE_SHIELD_EXPECTED_KEY,
    RELEASE_URGENT_ALIGN_FP_KEY,
    MIXED_DPL_ALIGN_SESSION_KEY,
    "hb-coop-release-pending-staff-build",
    "hb-coop-mixed-dpl-align",
  ];
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export type ClearClientRuntimeCachesOptions = {
  /** Atalho instalado: nunca desregistrar SW (WebAPK cai). Só limpa Cache API e pede update. */
  preserveServiceWorker?: boolean;
};

export async function clearClientRuntimeCaches(
  options?: ClearClientRuntimeCachesOptions
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  if (options?.preserveServiceWorker) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
}

export type AlignClientRuntimeOptions = {
  /** Limpa SW/cache e recarrega (padrão para nova versão na nuvem). */
  hard?: boolean;
  targetBuild?: number;
  /** Nova versão na Vercel — ignora cooldown/sessão/rajada de reload. */
  urgentUpgrade?: boolean;
  /** build:sha:dpl — deduplica align urgente (anti-loop). */
  targetFingerprint?: string;
};

/** Alinha runtime ao release canônico. */
export async function alignClientRuntimeToRelease(
  reason: string,
  targetDeploymentId?: string,
  options?: AlignClientRuntimeOptions
): Promise<boolean> {
  /** Atalho instalado: nunca hard-reload automático (causa “This page couldn’t load” no WebAPK). */
  if (shouldAutoAlignClientRelease() && options?.urgentUpgrade !== true) {
    return false;
  }
  if (
    shouldAutoAlignClientRelease() &&
    isPwaColdStartWindow() &&
    options?.urgentUpgrade !== true
  ) {
    return false;
  }
  const hard = options?.hard !== false;
  const sessionTarget = [
    options?.targetBuild ?? 0,
    (targetDeploymentId ?? "").trim(),
    hard ? "hard" : "soft",
  ].join(":");

  const embedded = getEmbeddedClientRelease();
  const buildBehind =
    options?.targetBuild != null &&
    options.targetBuild > 0 &&
    embedded.build > 0 &&
    options.targetBuild > embedded.build;
  const urgent = options?.urgentUpgrade === true || buildBehind;
  const targetFp = (options?.targetFingerprint ?? "").trim();

  if (urgent && targetFp && !allowUrgentReleaseAlignForFingerprint(targetFp)) {
    return false;
  }

  if (!urgent && releaseAlignSessionTarget() === sessionTarget) {
    return false;
  }

  if (!urgent && typeof sessionStorage !== "undefined") {
    try {
      const last = Number(sessionStorage.getItem(RELEASE_ALIGN_COOLDOWN_KEY) || 0);
      if (last > 0 && Date.now() - last < RELEASE_ALIGN_COOLDOWN_MS) {
        return false;
      }
    } catch {
      /* ignore */
    }
  }
  if (!shouldAllowHardReload(reason, { bypassBurstForBuildUpgrade: urgent })) {
    return false;
  }
  try {
    sessionStorage?.setItem(RELEASE_ALIGN_COOLDOWN_KEY, String(Date.now()));
    markReleaseAlignSessionTarget(sessionTarget);
  } catch {
    /* ignore */
  }

  if (!hard) {
    window.location.reload();
    return true;
  }

  await clearClientRuntimeCaches({
    preserveServiceWorker: shouldAutoAlignClientRelease(),
  });
  try {
    sessionStorage?.setItem(RELEASE_NAV_MARK_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("_hbRelease");
  url.searchParams.delete("_hbTargetDpl");
  url.searchParams.set("_hbRelease", String(Date.now()));
  if (targetDeploymentId) {
    url.searchParams.set("_hbTargetDpl", targetDeploymentId.slice(4, 20));
  }
  window.location.replace(url.toString());
  return true;
}

export function hardReloadForNewRelease(reason = "guard"): void {
  void alignClientRuntimeToRelease(reason);
}

export function buildInlinePageReleaseBootstrap(pageRelease: ClientReleaseInfo): string {
  return `window.__HB_PAGE_RELEASE__=${JSON.stringify(pageRelease)};`;
}

export const PWA_REPAIR_SESSION_KEY = "hb-coop-pwa-repair-done";
export const PWA_REPAIR_SESSION_VERSION = String(APP_BUILD_VERSION);

/** Definido em pwa-launch antes de entrar no app — evita re-redirect e mantém splash HB. */
export const PWA_DIRECT_ENTRY_SESSION_KEY = "hb-coop-pwa-direct-entry";

/** Evita rajada de replace/reload do guard standalone no cold start (rede lenta). */
export const PWA_STANDALONE_GUARD_DEDUP_KEY = "hb-coop-pwa-standalone-guard-target";
export const PWA_STANDALONE_GUARD_AT_KEY = "hb-coop-pwa-standalone-guard-at";
export const PWA_STANDALONE_GUARD_BURST_KEY = "hb-coop-pwa-guard-burst";
export const PWA_STANDALONE_GUARD_DEDUP_MS = 12_000;
export const PWA_STANDALONE_GUARD_BURST_MAX = 3;
export const PWA_STANDALONE_GUARD_BURST_WINDOW_MS = 120_000;

/**
 * Ícone instalado (WebAPK): build antigo → launch ou reparo silencioso (cooperado).
 */
export function buildInlinePwaStandaloneLaunchGuardScript(): string {
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairVer = PWA_REPAIR_SESSION_VERSION;
  const buildSeenKey = BUILD_SEEN_KEY;
  const appBuild = APP_BUILD_VERSION;
  const repairLocalKey = "hb-coop-pwa-repair-done-build";
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const silent = buildInlineCooperadoPwaSilentRepairBlock();
  return `(function(){try{${silent}var standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;if(!standalone)return;try{if(sessionStorage.getItem("${directKey}")==="1")return;}catch(e){}var path=location.pathname||"";if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-diag")>=0)return;var repairKey="${repairKey}";var repairVer="${repairVer}";var repairLocalKey="${repairLocalKey}";var buildSeenKey="${buildSeenKey}";var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};function repairMarkOk(v){if(!v)return false;var s=String(v);if(s===repairVer||s===String(pageBuild))return true;var n=parseInt(s,10);return n>0&&n>=pageBuild-1;}var seen=0;try{seen=parseInt(localStorage.getItem(buildSeenKey)||"0",10);}catch(e){}var repairLocal=false;var repairSession=false;try{repairLocal=repairMarkOk(localStorage.getItem(repairLocalKey));}catch(e){}try{repairSession=repairMarkOk(sessionStorage.getItem(repairKey));}catch(e){}var repairOk=repairLocal||repairSession;var buildOk=!seen||seen>=pageBuild-1;var veryStale=seen>0&&seen<pageBuild-1;var loginNext="/login?hb-pwa="+pageBuild;var nextPath=path+location.search;if(!nextPath||nextPath==="/")nextPath=loginNext;if(repairOk&&buildOk)return;if(path.indexOf("/login")>=0&&buildOk)return;if((path.indexOf("/login")>=0||path.indexOf("/dashboard")>=0)&&repairOk)return;if(!buildOk||veryStale){hbCoopPwaStaleRepairOrLaunch(pageBuild,loginNext);return;}if(path.indexOf("/login")>=0||path.indexOf("/dashboard")>=0)return;location.replace("/pwa-launch.html?next="+encodeURIComponent(nextPath));}catch(e){}})();`;
}

/** 1º paint: no atalho remove todo SW legado; registra /sw.js passthrough. */
export function buildInlineServiceWorkerMigrationScript(): string {
  const repairKey = PWA_REPAIR_SESSION_KEY;
  const repairVer = PWA_REPAIR_SESSION_VERSION;
  return `(function(){if(!("serviceWorker"in navigator))return;function leg(u){return u&&(u.indexOf("sw.js?")>=0||u.indexOf("sw.js%3F")>=0);}function scriptUrl(r){return(r.active&&r.active.scriptURL)||(r.waiting&&r.waiting.scriptURL)||(r.installing&&r.installing.scriptURL)||"";}function isPassthroughSw(u){return u&&u.indexOf("/sw.js")>=0&&!leg(u);}void navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.filter(function(r){return leg(scriptUrl(r));}).map(function(r){return r.unregister();}));}).then(function(){return navigator.serviceWorker.getRegistrations();}).then(function(regs){var ok=regs.some(function(r){return isPassthroughSw(scriptUrl(r));});if(ok)return;return navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});}).catch(function(){});})();`;
}

/**
 * Script inline no <head> — bloqueia deploy legado e alinha HTML cacheado à produção atual.
 * Só consulta /api/client-release neste carregamento de documento (não faz polling).
 */
export function buildInlineDeploymentBootScript(pageRelease: ClientReleaseInfo): string {
  const blockedJson = JSON.stringify([...BLOCKED_VERCEL_DEPLOYMENT_IDS]);
  const pageJson = JSON.stringify(pageRelease);
  const urgentDedupMs = URGENT_RELEASE_ALIGN_DEDUP_MS;
  const pwaColdMs = PWA_COLD_START_SW_RELOAD_GRACE_MS;
  const mixedOnceKey = MIXED_DPL_ALIGN_SESSION_KEY;
  const episodeHelpers = buildInlineReleaseEpisodeGuardScript();
  return `(function(){${episodeHelpers}var BLOCK=${blockedJson};var PAGE=${pageJson};var BURST_KEY=${JSON.stringify(RELOAD_BURST_KEY)};var EXPECTED_KEY=${JSON.stringify(RELEASE_SHIELD_EXPECTED_KEY)};var URGENT_FP_KEY=${JSON.stringify(RELEASE_URGENT_ALIGN_FP_KEY)};var NAV_KEY=${JSON.stringify(RELEASE_NAV_MARK_KEY)};var MIXED_ONCE_KEY=${JSON.stringify(mixedOnceKey)};var MAX=${MAX_RELOADS_PER_MINUTE};var URGENT_DEDUP_MS=${urgentDedupMs};var PWA_COLD_MS=${pwaColdMs};function pwaCold(){try{return window.matchMedia("(display-mode: standalone)").matches&&performance.now()<PWA_COLD_MS;}catch(e){return false;}}function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&m[1].indexOf("dpl_")===0&&m[1].length>=24&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function blocked(ids){for(var i=0;i<ids.length;i++){if(BLOCK.indexOf(ids[i])>=0)return ids[i];}return null;}function cloudFp(cloud){return String(cloud.build)+":"+(cloud.gitCommitSha||"").trim()+":"+(cloud.deploymentId||"").trim();}function allowUrgentFp(fp){try{var raw=sessionStorage.getItem(URGENT_FP_KEY);var now=Date.now();var prev=raw?JSON.parse(raw):null;if(prev&&prev.fp===fp&&now-prev.t<URGENT_DEDUP_MS)return false;sessionStorage.setItem(URGENT_FP_KEY,JSON.stringify({fp:fp,t:now}));return true;}catch(e){return true;}}function allowReload(reason,urgent){if(urgent)return true;try{var now=Date.now();var raw=sessionStorage.getItem(BURST_KEY);var entries=raw?JSON.parse(raw):[];entries=entries.filter(function(e){return now-e.t<60000;});if(entries.length>=MAX)return false;entries.push({t:now,r:reason});sessionStorage.setItem(BURST_KEY,JSON.stringify(entries));return true;}catch(e){return true;}}function standalonePwa(){try{return window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;}catch(e){return false;}}function hardAlign(reason,cloud,urgent){var force=urgent||reason==="blocked"||reason==="mixed_dpl"||(String(reason||"").indexOf("cloud_")===0);if(!force&&(pwaCold()||standalonePwa()))return;if(hbEpisodeBlocked())return;var fp=cloud?cloudFp(cloud):"";if(urgent){if(fp&&!allowUrgentFp(fp))return;}else if(!allowReload(reason,false))return;if(!allowReload(reason,urgent))return;var targetId=((cloud&&cloud.deploymentId)||PAGE.deploymentId||"").trim();hbEpisodePending();Promise.resolve().then(function(){if(!("caches" in window))return;return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});}).then(function(){if(!("serviceWorker" in navigator))return;return navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});}).finally(function(){hbEpisodeDone();if(reason==="mixed_dpl"){try{sessionStorage.setItem(MIXED_ONCE_KEY,"1");}catch(e){}}try{sessionStorage.setItem(NAV_KEY,String(Date.now()));}catch(e){}location.replace(hbAlignUrl(targetId));});}function mixedDeploy(){var pageId=(document.documentElement.getAttribute("data-dpl-id")||PAGE.deploymentId||"").trim();if(pageId.indexOf("dpl_")!==0||pageId.length<24)pageId="";var ids=collect();var u={};if(pageId)u[pageId]=1;for(var i=0;i<ids.length;i++)u[ids[i]]=1;var keys=Object.keys(u);if(keys.length>1)return true;if(pageId&&ids.length>0){for(var j=0;j<ids.length;j++){if(ids[j]!==pageId)return true;}}return false;}function bootReleaseCheck(){var pageId=(document.documentElement.getAttribute("data-dpl-id")||PAGE.deploymentId||"").trim();var ids=collect();if(blocked(ids)||(pageId&&blocked([pageId]))){hardAlign("blocked",null,true);return;}if(mixedDeploy()){try{var raw=localStorage.getItem("coopeagriplla_session");var coop=raw&&JSON.parse(raw);var coopSess=coop&&(coop.role==="cooperado"||coop.cooperadoId);if(coopSess&&!standalonePwa()){return;}}catch(e){}hardAlign("mixed_dpl",null,false);return;}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bootReleaseCheck);else bootReleaseCheck();})();`;
}
