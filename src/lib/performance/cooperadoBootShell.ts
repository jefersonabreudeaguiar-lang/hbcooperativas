/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Só esqueleto neutro (sem nome/valor do cache) até o React montar o Início real.
 */
import {
  PWA_DIRECT_ENTRY_SESSION_KEY,
  PWA_REPAIR_SESSION_KEY,
  PWA_REPAIR_SESSION_VERSION,
} from "@/lib/pwa/clientRelease";
import { cooperadoMobilePilotInlineSessionHelperJs } from "@/lib/cooperado/cooperadoMobilePilotInlineSession";

const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const pilotFn = cooperadoMobilePilotInlineSessionHelperJs();
  return `(function(){try{${pilotFn}
if(typeof document==="undefined")return;
var el=document.getElementById("hb-coop-boot-shell");
if(!el)return;
var hide=function(){try{el.style.display="none";el.setAttribute("aria-hidden","true");}catch(e){}};
var show=function(){try{el.style.display="flex";el.setAttribute("aria-hidden","false");}catch(e){}};
var p=(location.pathname||"").toLowerCase();
if(p==="/login"||p==="/cadastro"||p==="/esqueci-senha"||p.startsWith("/register")||p==="/forgot-password"){
  try{sessionStorage.removeItem("${directKey}");}catch(e){}
  hide();
  return;
}
try{if(sessionStorage.getItem("${PWA_REPAIR_SESSION_KEY}")===${JSON.stringify(PWA_REPAIR_SESSION_VERSION)}){sessionStorage.removeItem("${PWA_REPAIR_SESSION_KEY}");}}catch(e){}
if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){hide();return;}
var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;
if(!standalone&&!mobile){hide();return;}
function sessUser(raw){try{var o=typeof raw==="string"?JSON.parse(raw):raw;if(!o)return null;if(o.role||o.cooperadoId)return o;if(o.user&&(o.user.role||o.user.cooperadoId))return o.user;return o;}catch(e){return null;}}
try{
  var raw=localStorage.getItem("${SESSION_KEY}");
  var s=sessUser(raw);
  if(s&&(s.role==="cooperado"||s.cooperadoId)){
    show();
    return;
  }
  if(s&&hbCoopSessPilot(s)&&(standalone||mobile)){hide();return;}
}catch(e){}
try{if(sessionStorage.getItem("${directKey}")==="1"){show();return;}}catch(e){}
}catch(e){}})();`;
}

export function dismissCooperadoBootShell(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("hb-coop-boot-shell");
  if (!el) return;
  el.style.display = "none";
  el.setAttribute("aria-hidden", "true");
  try {
    sessionStorage.removeItem(PWA_DIRECT_ENTRY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
