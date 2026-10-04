import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Persistido após confirmar que o bundle carregado bate com o release oficial. */
export const DEPLOYMENT_SEEN_KEY = "hb-coop-app-deployment-seen";
export const BUILD_SEEN_KEY = "hb-coop-app-build-seen";
export const RELOAD_BURST_KEY = "hb-coop-release-reload-burst";
/** Evita rajada de align/reload seguidos (PWA cooperado). */
export const RELEASE_ALIGN_COOLDOWN_KEY = "hb-coop-release-align-at";
export const RELEASE_ALIGN_COOLDOWN_MS = 45_000;

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
      hard: true,
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
      hard: true,
    };
  }

  return {
    action: "align",
    reason: `chunks:${loaded.join(",")}!=${targetId}`,
    hard: true,
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

/** Limpa caches locais e navega sem query antiga — força HTML novo do CDN/origin. */
export async function alignClientRuntimeToRelease(reason: string, targetDeploymentId?: string): Promise<boolean> {
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
  } catch {
    /* ignore */
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

/** Script inline no <head> — alinha page + chunks ao /api/client-release. */
export function buildInlineDeploymentBootScript(pageRelease: ClientReleaseInfo): string {
  const blockedJson = JSON.stringify([...BLOCKED_VERCEL_DEPLOYMENT_IDS]);
  const pageJson = JSON.stringify(pageRelease);
  const buildKey = JSON.stringify(BUILD_SEEN_KEY);
  const dplKey = JSON.stringify(DEPLOYMENT_SEEN_KEY);
  return `(function(){var BLOCK=${blockedJson};var PAGE=${pageJson};var BURST_KEY=${JSON.stringify(RELOAD_BURST_KEY)};var BUILD_KEY=${buildKey};var DPL_KEY=${dplKey};var MAX=${MAX_RELOADS_PER_MINUTE};window.__HB_PAGE_RELEASE__=PAGE;function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function blocked(ids){for(var i=0;i<ids.length;i++){if(BLOCK.indexOf(ids[i])>=0)return ids[i];}return null;}function allowReload(reason){try{var now=Date.now();var raw=sessionStorage.getItem(BURST_KEY);var entries=raw?JSON.parse(raw):[];entries=entries.filter(function(e){return now-e.t<60000;});if(entries.length>=MAX)return false;entries.push({t:now,r:reason});sessionStorage.setItem(BURST_KEY,JSON.stringify(entries));return true;}catch(e){return true;}}function markSeen(c){try{var b=c&&c.build?c.build:PAGE.build;var d=(c&&c.deploymentId)||PAGE.deploymentId||"";localStorage.setItem(BUILD_KEY,String(b));if(d)localStorage.setItem(DPL_KEY,d);sessionStorage.removeItem(BURST_KEY);}catch(e){}}function hardAlign(reason,targetId){if(!allowReload(reason))return;Promise.resolve().then(function(){if(!("caches" in window))return;return caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});}).then(function(){if(!("serviceWorker" in navigator))return;return navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});}).finally(function(){var u=new URL(location.origin+location.pathname);u.searchParams.set("_hbRelease",String(Date.now()));if(targetId)u.searchParams.set("_hbTargetDpl",targetId.slice(4,20));location.replace(u.toString());});}function evaluate(canonical){var targetId=(canonical&&canonical.deploymentId||"").trim()||PAGE.deploymentId;var pageId=(document.documentElement.getAttribute("data-dpl-id")||PAGE.deploymentId||"").trim();var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||String(PAGE.build),10);if(canonical&&canonical.build>0&&pageBuild!==canonical.build)return hardAlign("html_build:"+pageBuild,targetId);if(canonical&&canonical.build>0&&PAGE.build>0&&PAGE.build!==canonical.build)return hardAlign("ssr_boot:"+PAGE.build,targetId);var ids=collect();if(blocked(ids)||(pageId&&blocked([pageId])))return hardAlign("blocked",targetId);if(!targetId)return;if(!ids.length)return;var i;for(i=0;i<ids.length;i++){if(ids[i]!==targetId)return hardAlign("chunks:"+ids[i],targetId);}if(pageId&&pageId!==targetId)return hardAlign("page:"+pageId,targetId);markSeen(canonical||PAGE);}function pullCanonical(){fetch("/api/client-release",{cache:"no-store",credentials:"same-origin",headers:{Pragma:"no-cache","Cache-Control":"no-cache"}}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;var c={build:typeof j.build==="number"?j.build:PAGE.build,deploymentId:(j.deploymentId||"").trim(),gitCommitSha:j.gitCommitSha||""};evaluate(c);setTimeout(function(){evaluate(c);},600);setTimeout(function(){evaluate(c);},2000);}).catch(function(){});}evaluate(PAGE);pullCanonical();})();`;
}
