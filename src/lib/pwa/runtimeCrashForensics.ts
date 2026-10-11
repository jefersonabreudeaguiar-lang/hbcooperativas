import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

/** Últimos erros de runtime (TDZ / chunk) gravados pelo script inline no layout. */
export const RUNTIME_CRASH_LOG_KEY = "hb-coop-runtime-crash-log";

export type RuntimeCrashLogEntry = {
  t: number;
  type: "error" | "rejection";
  message: string;
  href?: string;
  src?: string | null;
  line?: number | null;
  col?: number | null;
  stack?: string | null;
  dpl?: string | null;
  build?: string | null;
  chunkDpls?: string[];
};

export function readRuntimeCrashLog(): RuntimeCrashLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RUNTIME_CRASH_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RuntimeCrashLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function buildInlineRuntimeCrashRecorderScript(): string {
  const storageKey = RUNTIME_CRASH_LOG_KEY;
  const appBuild = APP_BUILD_VERSION;
  return `(function(){try{var K=${JSON.stringify(storageKey)};var TDZ_KEY="hb-coop-tdz-auto-rescue-at";var APP_BUILD=${appBuild};function chunkDpls(){var out=[];var seen={};try{document.querySelectorAll('script[src*="dpl="],link[href*="dpl="]').forEach(function(el){var u=el.src||el.href||"";var m=u.match(/[?&]dpl=([^&]+)/);if(m&&m[1]&&m[1].indexOf("dpl_")===0&&m[1].length>=24&&!seen[m[1]]){seen[m[1]]=1;out.push(m[1]);}});}catch(e){}return out;}function persist(entry){try{var raw=localStorage.getItem(K);var arr=raw?JSON.parse(raw):[];if(!Array.isArray(arr))arr=[];arr.push(entry);if(arr.length>10)arr=arr.slice(-10);localStorage.setItem(K,JSON.stringify(arr));}catch(e){}}function autoRescueTdz(){try{var last=sessionStorage.getItem(TDZ_KEY);if(last&&Date.now()-parseInt(last,10)<15000)return;sessionStorage.setItem(TDZ_KEY,String(Date.now()));}catch(e){}var b=parseInt(document.documentElement.getAttribute("data-app-build")||"0",10);if(!b)b=APP_BUILD;var next="/login?hb-pwa="+b;if((location.pathname||"").indexOf("/dashboard")>=0)next="/login?hb-pwa="+b+"&next="+encodeURIComponent("/dashboard");location.replace("/pwa-rescue.html?auto=1&reason=tdz&next="+encodeURIComponent(next));}function interesting(msg){if(!msg)return false;msg=String(msg);return msg.indexOf("before initialization")>=0||msg.indexOf("ChunkLoadError")>=0||msg.indexOf("Loading chunk")>=0||msg.indexOf("Failed to fetch dynamically imported module")>=0;}window.addEventListener("error",function(e){var m=e.message||"";if(!interesting(m))return;persist({t:Date.now(),type:"error",message:m,src:e.filename||null,line:e.lineno||null,col:e.colno||null,stack:e.error&&e.error.stack?String(e.error.stack).slice(0,2000):null,href:location.href,dpl:document.documentElement.getAttribute("data-dpl-id"),build:document.documentElement.getAttribute("data-app-build"),chunkDpls:chunkDpls()});if(m.indexOf("before initialization")>=0)autoRescueTdz();});window.addEventListener("unhandledrejection",function(e){var r=e.reason;var m=r&&r.message?r.message:String(r);if(!interesting(m))return;persist({t:Date.now(),type:"rejection",message:m,href:location.href,dpl:document.documentElement.getAttribute("data-dpl-id"),build:document.documentElement.getAttribute("data-app-build"),chunkDpls:chunkDpls()});if(m.indexOf("before initialization")>=0)autoRescueTdz();});}catch(e){}})();`;
}
