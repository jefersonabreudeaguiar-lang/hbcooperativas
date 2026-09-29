import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Persistido após confirmar que o bundle carregado bate com o release oficial. */
export const DEPLOYMENT_SEEN_KEY = "hb-coop-app-deployment-seen";
export const BUILD_SEEN_KEY = "hb-coop-app-build-seen";
/** Evita loop infinito de reload quando CDN/HTML demoram a alinhar. */
export const RELOAD_BURST_KEY = "hb-coop-release-reload-burst";

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
 * Se chunks carregados ≠ release oficial (ou blocklist), força reload.
 * Quando os scripts já batem com /api/client-release, considera OK — não exige localStorage atualizado.
 */
export function evaluateDeploymentGuard(input: {
  official: ClientReleaseInfo;
  loadedDeploymentIds: string[];
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
  if (allMatchOfficial) {
    return { action: "ok", reason: "deployment_aligned" };
  }

  return {
    action: "reload",
    reason: `loaded_dpl_mismatch:${loaded.join(",")}!=${officialId}`,
  };
}

const MAX_RELOADS_PER_MINUTE = 3;

/** Retorna false se já houve recargas demais — evita tela piscando para sempre. */
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

export function hardReloadForNewRelease(reason = "guard"): void {
  if (!shouldAllowHardReload(reason)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("_hbRelease", String(Date.now()));
  window.location.replace(url.toString());
}

/** Script inline no <head> — bloqueia dpl_Eoe9 e chunks ≠ release oficial. */
export function buildInlineDeploymentBootScript(): string {
  const blockedJson = JSON.stringify([...BLOCKED_VERCEL_DEPLOYMENT_IDS]);
  return `(function(){var BLOCK=${blockedJson};var BURST_KEY=${JSON.stringify(RELOAD_BURST_KEY)};var MAX=${MAX_RELOADS_PER_MINUTE};function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function blocked(ids){for(var i=0;i<ids.length;i++){if(BLOCK.indexOf(ids[i])>=0)return ids[i];}return null;}function allowReload(reason){try{var now=Date.now();var raw=sessionStorage.getItem(BURST_KEY);var entries=raw?JSON.parse(raw):[];entries=entries.filter(function(e){return now-e.t<60000;});if(entries.length>=MAX)return false;entries.push({t:now,r:reason});sessionStorage.setItem(BURST_KEY,JSON.stringify(entries));return true;}catch(e){return true;}}function reload(reason){if(!allowReload(reason||"boot"))return;try{sessionStorage.setItem("hb-coop-last-release-reload",reason||"boot");}catch(e){}var u=new URL(location.href);u.searchParams.set("_hbRelease",String(Date.now()));location.replace(u.toString());}function checkLoaded(officialId){var htmlDpl=(document.documentElement.getAttribute("data-dpl-id")||"").trim();var ids=collect();var b=blocked(ids)||(htmlDpl&&blocked([htmlDpl]));if(b){if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister();});});}return reload("blocked:"+b);}if(!officialId||!ids.length)return;for(var j=0;j<ids.length;j++){if(ids[j]!==officialId)return reload("api_mismatch:"+ids[j]);}}fetch("/api/client-release",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(!j)return;var officialId=(j.deploymentId||"").trim();checkLoaded(officialId);setTimeout(function(){checkLoaded(officialId);},800);setTimeout(function(){checkLoaded(officialId);},2400);}).catch(function(){});})();`;
}
