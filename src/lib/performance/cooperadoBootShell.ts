/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Cooperado: Olá + esqueleto + abas (sem valor cacheado); some quando o React monta o Início completo.
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
function paintInicio(s){
  var nome=String(s&&s.name||"Cooperado").replace(/[<>&]/g,"").split(/\\s+/)[0]||"Cooperado";
  el.innerHTML='<div style="height:56px;background:#14532d;flex-shrink:0;display:flex;align-items:center;padding:0 16px;color:#fff;font-size:14px;font-weight:600">HB Cooperativas</div>'
    +'<div style="flex:1;padding:16px;max-width:32rem;margin:0 auto;width:100%;padding-bottom:72px">'
    +'<p style="font-size:18px;font-weight:600;color:#111827;margin:0">Olá, '+nome+'</p>'
    +'<div style="margin-top:8px;height:14px;width:40%;background:#e5e7eb;border-radius:6px"></div>'
    +'<div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    +'<div style="height:96px;background:#fff;border-radius:12px;border:1px solid #e5e7eb"></div>'
    +'<div style="height:96px;background:#fff;border-radius:12px;border:1px solid #e5e7eb"></div>'
    +"</div></div>"
    +'<div style="position:fixed;bottom:0;left:0;right:0;height:56px;background:#fff;border-top:1px solid #e5e7eb;display:flex;justify-content:space-around;align-items:center;padding:0 8px">'
    +'<span style="font-size:11px;color:#166534;font-weight:600">Início</span>'
    +'<span style="font-size:11px;color:#9ca3af">Entregas</span>'
    +'<span style="font-size:11px;color:#9ca3af">Ficha</span>'
    +'<span style="font-size:11px;color:#9ca3af">Financeiro</span>'
    +"</div>";
  el.style.display="flex";
  el.setAttribute("aria-hidden","false");
}
function sessUser(raw){try{var o=typeof raw==="string"?JSON.parse(raw):raw;if(!o)return null;if(o.role||o.cooperadoId)return o;if(o.user&&(o.user.role||o.user.cooperadoId))return o.user;return o;}catch(e){return null;}}
try{
  var raw=localStorage.getItem("${SESSION_KEY}");
  var s=sessUser(raw);
  if(s&&(s.role==="cooperado"||s.cooperadoId)){
    paintInicio(s);
    return;
  }
  if(s&&hbCoopSessPilot(s)&&(standalone||mobile)){hide();return;}
}catch(e){}
try{if(sessionStorage.getItem("${directKey}")==="1"){el.style.display="flex";el.setAttribute("aria-hidden","false");return;}}catch(e){}
setTimeout(hide,3500);
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
