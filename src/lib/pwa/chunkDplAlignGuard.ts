import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { buildInlineCooperadoPwaSilentRepairBlock } from "@/lib/pwa/cooperadoPwaSilentRepairInline";

/** Último deploy canônico gravado após reparo / login preparado. */
export const RUNTIME_CANONICAL_DPL_KEY = "hb-coop-runtime-canonical-dpl";

/**
 * Observa scripts/_next com dpl diferente do HTML ou da nuvem.
 * WebAPK: só marca mismatch — purge/replace automático causa "This page couldn't load".
 */
export function buildInlineChunkDplAlignGuardScript(): string {
  const appBuild = APP_BUILD_VERSION;
  const rescueDedupKey = "hb-coop-chunk-dpl-rescue-at";
  const silent = buildInlineCooperadoPwaSilentRepairBlock();
  const entregaKey = "hb_cooperado_entrega_flow_until";
  const graceMs = 2_500;
  return `(function(){try{${silent}var path=(location.pathname||"").toLowerCase();if(path.indexOf("pwa-rescue")>=0||path.indexOf("pwa-launch")>=0||path.indexOf("pwa-console-forensics")>=0||path.indexOf("pwa-crash-forensics")>=0||path.indexOf("pwa-diag")>=0)return;var bootAt=Date.now();var GRACE=${graceMs};var htmlDpl=(document.documentElement.getAttribute("data-dpl-id")||"").trim();var cloudDpl="";var rescued=false;function entregaActive(){try{var u=Number(sessionStorage.getItem("${entregaKey}")||0);return u>Date.now();}catch(e){return false;}}function parseDpl(u){if(!u)return"";var m=String(u).match(/[?&]dpl=([^&]+)/);if(!m)return"";try{var id=decodeURIComponent(m[1]).trim();return id.indexOf("dpl_")===0&&id.length>=24?id:"";}catch(e){return"";}}function standalone(){return hbCoopStandalonePwa();}function cooperadoAppRoute(){return path.indexOf("/dashboard")>=0||path.indexOf("/financeiro")>=0||path.indexOf("/notas-pedido")>=0||path.indexOf("/ficha-corrida")>=0||path.indexOf("/precos")>=0;}function toRescue(reason){if(rescued||entregaActive())return;if(Date.now()-bootAt<GRACE)return;try{var last=sessionStorage.getItem("${rescueDedupKey}");if(last&&Date.now()-parseInt(last,10)<8000)return;sessionStorage.setItem("${rescueDedupKey}",String(Date.now()));}catch(e){}var b=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10)||${appBuild};hbCoopMarkPwaRepair(b);if(standalone()){hbCoopNoteWebApkChunkMismatch(reason);return;}var coop=false;try{coop=hbCoopIsCooperadoPwaSession();}catch(e){}if(!coop)return;if(!cooperadoAppRoute())return;rescued=true;var next="/login?hb-pwa="+b;if(path.indexOf("/dashboard")>=0)next="/login?hb-pwa="+b+"&next="+encodeURIComponent("/dashboard");location.replace(next);}function checkUrl(u){if(Date.now()-bootAt<GRACE||entregaActive())return;var chunkDpl=parseDpl(u);if(!chunkDpl)return;var canon=cloudDpl||htmlDpl;if(!canon)return;if(chunkDpl!==canon)toRescue("chunk_dpl_mismatch");}fetch("/api/client-release?_="+Date.now(),{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(c){if(c&&c.deploymentId)cloudDpl=String(c.deploymentId).trim();setTimeout(function(){if(htmlDpl&&cloudDpl&&htmlDpl!==cloudDpl)toRescue("html_dpl_not_cloud");},GRACE);}).catch(function(){});if(typeof PerformanceObserver!=="undefined"){try{var po=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){checkUrl(e.name);});});po.observe({type:"resource",buffered:true});}catch(e){}}setTimeout(function(){document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){checkUrl(el.src||el.href||"");});},GRACE);}catch(e){}})();`;
}
