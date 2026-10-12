/** Uma recuperação inline (HTML≠nuvem ou mixed_dpl) por sessão — evita aligns concorrentes. */
export const RELEASE_EPISODE_ALIGN_SESSION_KEY = "hb-coop-inline-release-align-episode";

/** Marcador legado: gravado só ao iniciar navegação de mixed_dpl (testes/forensics). */
export const MIXED_DPL_ALIGN_SESSION_KEY = "hb-coop-mixed-dpl-align-once";

/** Helpers compartilhados por htmlDeploymentAlign e deployment boot inline. */
export function buildInlineReleaseEpisodeGuardScript(): string {
  const episodeKey = RELEASE_EPISODE_ALIGN_SESSION_KEY;
  return `function hbEpisodeBlocked(){try{var s=sessionStorage.getItem(${JSON.stringify(episodeKey)});return s==="pending"||s==="done";}catch(e){return true;}}function hbEpisodePending(){try{sessionStorage.setItem(${JSON.stringify(episodeKey)},"pending");}catch(e){}}function hbEpisodeDone(){try{sessionStorage.setItem(${JSON.stringify(episodeKey)},"done");}catch(e){}}function hbAlignUrl(targetDpl){var u=new URL(location.href);u.searchParams.delete("_hbRelease");u.searchParams.delete("_hbTargetDpl");u.searchParams.set("_hbRelease",String(Date.now()));if(targetDpl)u.searchParams.set("_hbTargetDpl",targetDpl.slice(4,20));return u.toString();}`;
}

/** Rescue concluiu purge de Cache API/SW; runtime Next deve confirmar dpl antes de marcar reparo. */
export const RESCUE_PENDING_VERIFY_KEY = "hb-coop-rescue-pending-verify";

export type DomDeploymentConsistency =
  | { status: "pending"; reason: "no_scripts_yet" }
  | { status: "ok"; canonicalDpl: string }
  | { status: "mixed"; deploymentIds: string[] };

/** Mesma regra do boot inline `mixedDeploy` + alinhamento página/scripts. */
export function evaluateDomDeploymentConsistency(input: {
  pageDeploymentId: string;
  loadedDeploymentIds: string[];
}): DomDeploymentConsistency {
  const pageId = input.pageDeploymentId.trim();
  const pageValid = pageId.startsWith("dpl_") && pageId.length >= 24;
  const loaded = input.loadedDeploymentIds.filter(Boolean);
  if (loaded.length === 0) {
    return { status: "pending", reason: "no_scripts_yet" };
  }
  const unique = new Set<string>();
  if (pageValid) unique.add(pageId);
  for (const id of loaded) unique.add(id);
  const ids = [...unique];
  if (ids.length === 1) {
    return { status: "ok", canonicalDpl: ids[0]! };
  }
  if (pageValid && loaded.every((id) => id === pageId)) {
    return { status: "ok", canonicalDpl: pageId };
  }
  return { status: "mixed", deploymentIds: ids };
}

export function buildInlineRescuePendingVerifyScript(): string {
  const pendingKey = RESCUE_PENDING_VERIFY_KEY;
  const repairKey = "hb-coop-pwa-repair-done";
  const repairLocalKey = "hb-coop-pwa-repair-done-build";
  const buildSeenKey = "hb-coop-app-build-seen";
  return `(function(){function collect(){var ids=[];var seen={};document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&m[1].indexOf("dpl_")===0&&m[1].length>=24&&!seen[m[1]]){seen[m[1]]=1;ids.push(m[1]);}});return ids;}function markOk(build,ver){try{sessionStorage.setItem("${repairKey}",ver);localStorage.setItem("${buildSeenKey}",String(build));localStorage.setItem("${repairLocalKey}",String(build));sessionStorage.removeItem("${pendingKey}");}catch(e){}}function verify(){var raw;try{raw=sessionStorage.getItem("${pendingKey}");}catch(e){return;}if(!raw)return;var pending;try{pending=JSON.parse(raw);}catch(e){try{sessionStorage.removeItem("${pendingKey}");}catch(x){}return;}if(!pending||!pending.deploymentId)return;var pageId=(document.documentElement.getAttribute("data-dpl-id")||"").trim();var loaded=collect();if(!loaded.length)return;var cloudDpl=String(pending.deploymentId).trim();var pageBuild=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||pending.build||0;var ver=String(pending.repairVer||pageBuild||"");if(!pageId||pageId!==cloudDpl)return;if(loaded.some(function(id){return id!==cloudDpl;}))return;fetch("/api/client-release?_="+Date.now(),{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(c){if(!c||String(c.deploymentId).trim()!==cloudDpl)return;markOk(c.build||pageBuild,ver);}).catch(function(){});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",verify);else verify();})();`;
}
