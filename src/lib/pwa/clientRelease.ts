import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

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
  return {
    build: Number.isFinite(build) ? build : 0,
    deploymentId,
    gitCommitSha: "",
  };
}

/** dpl=… em scripts/styles já parseados pelo navegador. */
export function collectLoadedDeploymentIdsFromDom(): string[] {
  if (typeof document === "undefined") return [];
  const ids = new Set<string>();
  const sel = 'script[src*="dpl="], link[href*="dpl="]';
  for (const el of document.querySelectorAll(sel)) {
    const url = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || "";
    const m = url.match(/[?&]dpl=([^&]+)/);
    if (m?.[1]) ids.add(m[1]);
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
  const pageDpl = (pageRelease?.deploymentId ?? embedded.deploymentId).trim();
  const canonDpl = canonical.deploymentId.trim();
  if (!canonDpl) return true;
  if (!pageDpl) return true;
  return pageDpl === canonDpl;
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

export function shouldAllowHardReload(reason: string): boolean {
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

export async function clearClientRuntimeCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
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
  /** Deploy legado bloqueado — limpa SW/cache. Demais casos: um reload discreto. */
  hard?: boolean;
  targetBuild?: number;
};

/** Alinha runtime ao release canônico — hard só para deployments bloqueados. */
export async function alignClientRuntimeToRelease(
  reason: string,
  targetDeploymentId?: string,
  options?: AlignClientRuntimeOptions
): Promise<boolean> {
  const hard = options?.hard === true;
  const sessionTarget = [
    options?.targetBuild ?? 0,
    (targetDeploymentId ?? "").trim(),
    hard ? "hard" : "soft",
  ].join(":");

  if (releaseAlignSessionTarget() === sessionTarget) {
    return false;
  }

  if (typeof sessionStorage !== "undefined") {
    try {
      const last = Number(sessionStorage.getItem(RELEASE_ALIGN_COOLDOWN_KEY) || 0);
      if (last > 0 && Date.now() - last < RELEASE_ALIGN_COOLDOWN_MS) {
        return false;
      }
    } catch {
      /* ignore */
    }
  }
  if (!shouldAllowHardReload(reason)) {
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

  await clearClientRuntimeCaches();
  const url = new URL(window.location.origin + window.location.pathname);
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

/**
 * Script inline no <head> — só bloqueia deployments legados perigosos.
 * Alinhamento de build/chunks fica no ClientDeploymentGuard (após UI), sem piscar no boot.
 */
export function buildInlineDeploymentBootScript(pageRelease: ClientReleaseInfo): string {
  const blockedJson = JSON.stringify([...BLOCKED_VERCEL_DEPLOYMENT_IDS]);
  const pageJson = JSON.stringify(pageRelease);
  return `(function(){var BLOCK=${blockedJson};var PAGE=${pageJson};var BURST_KEY=${JSON.stringify(RELOAD_BURST_KEY)};var MAX=${MAX_RELOADS_PER_MINUTE};function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function blocked(ids){for(var i=0;i<ids.length;i++){if(BLOCK.indexOf(ids[i])>=0)return ids[i];}return null;}function allowReload(reason){try{var now=Date.now();var raw=sessionStorage.getItem(BURST_KEY);var entries=raw?JSON.parse(raw):[];entries=entries.filter(function(e){return now-e.t<60000;});if(entries.length>=MAX)return false;entries.push({t:now,r:reason});sessionStorage.setItem(BURST_KEY,JSON.stringify(entries));return true;}catch(e){return true;}}function hardAlign(reason){if(!allowReload(reason))return;var targetId=(PAGE.deploymentId||"").trim();Promise.resolve().then(function(){if(!("caches" in window))return;return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});}).then(function(){if(!("serviceWorker" in navigator))return;return navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});}).finally(function(){var u=new URL(location.origin+location.pathname);u.searchParams.set("_hbRelease",String(Date.now()));if(targetId)u.searchParams.set("_hbTargetDpl",targetId.slice(4,20));location.replace(u.toString());});}function checkBlockedOnly(){var pageId=(document.documentElement.getAttribute("data-dpl-id")||PAGE.deploymentId||"").trim();var ids=collect();if(blocked(ids)||(pageId&&blocked([pageId])))hardAlign("blocked");}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",checkBlockedOnly);else checkBlockedOnly();})();`;
}
