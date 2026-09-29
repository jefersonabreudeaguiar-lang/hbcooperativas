import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Persistido após confirmar que o bundle carregado bate com o release oficial. */
export const DEPLOYMENT_SEEN_KEY = "hb-coop-app-deployment-seen";
export const BUILD_SEEN_KEY = "hb-coop-app-build-seen";

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
  if (typeof document === "undefined") return "";
  return (document.documentElement.getAttribute("data-dpl-id") ?? "").trim();
}

export function getHtmlEmbeddedAppBuild(): number | null {
  if (typeof document === "undefined") return null;
  const raw = (document.documentElement.getAttribute("data-app-build") ?? "").trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export type DeploymentGuardDecision =
  | { action: "ok"; reason: string }
  | { action: "pending"; reason: string }
  | { action: "reload"; reason: string };

function hasBlockedDeployment(ids: string[]): string | null {
  for (const id of ids) {
    if (BLOCKED_VERCEL_DEPLOYMENT_IDS.includes(id)) return id;
  }
  return null;
}

/**
 * Se o HTML/JS carregado pertence a outro deployment Vercel que o release atual, força reload.
 * Não apaga AppData — só substitui o runtime.
 */
export function evaluateDeploymentGuard(input: {
  official: ClientReleaseInfo;
  loadedDeploymentIds: string[];
  previouslySeenDeploymentId: string | null;
  htmlDeploymentId?: string | null;
}): DeploymentGuardDecision {
  const officialId = input.official.deploymentId;
  const loaded = input.loadedDeploymentIds.filter(Boolean);
  const htmlDpl = (input.htmlDeploymentId ?? "").trim();

  const blocked = hasBlockedDeployment(loaded);
  if (blocked) {
    return { action: "reload", reason: `blocked_deployment:${blocked}` };
  }
  if (htmlDpl && hasBlockedDeployment([htmlDpl])) {
    return { action: "reload", reason: `blocked_html_deployment:${htmlDpl}` };
  }

  if (!officialId) {
    return { action: "ok", reason: "deployment_id_unset_on_build" };
  }

  if (loaded.length === 0) {
    return { action: "pending", reason: "no_dpl_in_dom_yet" };
  }

  const allMatchOfficial = loaded.every((id) => id === officialId);
  if (!allMatchOfficial) {
    return {
      action: "reload",
      reason: `loaded_dpl_mismatch:${loaded.join(",")}!=${officialId}`,
    };
  }

  if (htmlDpl && htmlDpl !== officialId) {
    return {
      action: "reload",
      reason: `html_dpl_stale:${htmlDpl}!=${officialId}`,
    };
  }

  if (
    input.previouslySeenDeploymentId &&
    input.previouslySeenDeploymentId !== officialId
  ) {
    return {
      action: "reload",
      reason: `seen_deployment_changed:${input.previouslySeenDeploymentId}->${officialId}`,
    };
  }

  return { action: "ok", reason: "deployment_aligned" };
}

export function evaluateBuildGuard(input: {
  officialBuild: number;
  htmlBuild: number | null;
  previouslySeenBuild: string | null;
}): DeploymentGuardDecision {
  if (input.previouslySeenBuild != null && input.previouslySeenBuild !== String(input.officialBuild)) {
    return {
      action: "reload",
      reason: `build_changed:${input.previouslySeenBuild}->${input.officialBuild}`,
    };
  }
  if (input.htmlBuild != null && input.htmlBuild !== input.officialBuild) {
    return {
      action: "reload",
      reason: `html_build_stale:${input.htmlBuild}!=${input.officialBuild}`,
    };
  }
  return { action: "ok", reason: "build_aligned" };
}

export function hardReloadForNewRelease(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_hbRelease", String(Date.now()));
  window.location.replace(url.toString());
}

/** Script inline no <head> — roda antes do React; tira mobile do dpl_Eoe9… */
export function buildInlineDeploymentBootScript(): string {
  const blockedJson = JSON.stringify([...BLOCKED_VERCEL_DEPLOYMENT_IDS]);
  return `(function(){var BLOCK=${blockedJson};function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function blocked(ids){for(var i=0;i<ids.length;i++){if(BLOCK.indexOf(ids[i])>=0)return ids[i];}return null;}function reload(reason){try{sessionStorage.setItem("hb-coop-last-release-reload",reason||"boot");}catch(e){}var u=new URL(location.href);u.searchParams.set("_hbRelease",String(Date.now()));location.replace(u.toString());}function checkLoaded(officialId,officialBuild){var htmlDpl=(document.documentElement.getAttribute("data-dpl-id")||"").trim();var htmlBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"",10);var ids=collect();var b=blocked(ids)||(htmlDpl&&blocked([htmlDpl]));if(b){if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister();});});}return reload("blocked:"+b);}if(officialId&&ids.length){for(var j=0;j<ids.length;j++){if(ids[j]!==officialId)return reload("api_mismatch:"+ids[j]);}}if(officialId&&htmlDpl&&htmlDpl!==officialId)return reload("html_api:"+htmlDpl);if(officialBuild&&ids.length===0&&Number.isFinite(htmlBuild)&&htmlBuild!==officialBuild)return reload("html_build:"+htmlBuild);}var attempts=0;var poll=setInterval(function(){attempts++;var ids=collect();if(ids.length||attempts>=16){clearInterval(poll);fetch("/api/client-release",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;var officialId=(j.deploymentId||"").trim();var officialBuild=typeof j.build==="number"?j.build:0;checkLoaded(officialId,officialBuild);}).catch(function(){});}},400);fetch("/api/client-release",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;var officialId=(j.deploymentId||"").trim();var officialBuild=typeof j.build==="number"?j.build:0;checkLoaded(officialId,officialBuild);}).catch(function(){});})();`;
}
