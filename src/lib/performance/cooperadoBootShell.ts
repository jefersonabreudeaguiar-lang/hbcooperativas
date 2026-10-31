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
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const pilotFn = cooperadoMobilePilotInlineSessionHelperJs();
  return `(function(){try{${pilotFn}
if(typeof document==="undefined")return;
var el=document.getElementById("hb-coop-boot-shell");
if(!el)return;
var hide=function(){try{el.style.display="none";el.setAttribute("aria-hidden","true");}catch(e){}};
function recoveryFallback(){
  try{
    if(el.getAttribute("aria-hidden")==="true"||document.getElementById("hb-coop-boot-recovery"))return;
    var host=el.children&&el.children[1]?el.children[1]:el;
    var box=document.createElement("section");box.id="hb-coop-boot-recovery";
    box.style.cssText="margin-top:18px;padding:14px;border:1px solid #bbf7d0;border-radius:12px;background:#fff;color:#14532d;font:14px/1.45 system-ui,sans-serif";
    var title=document.createElement("strong");title.textContent="O app está demorando para abrir";box.appendChild(title);
    var text=document.createElement("p");text.textContent="Sua tela ainda está sendo carregada. Tente novamente ou abra o acesso do cooperado.";text.style.margin="6px 0 12px";box.appendChild(text);
    var retry=document.createElement("button");retry.type="button";retry.textContent="Tentar novamente";retry.style.cssText="padding:9px 13px;border:0;border-radius:8px;background:#15803d;color:#fff;font-weight:600";retry.onclick=function(){location.reload();};box.appendChild(retry);
    var login=document.createElement("a");login.href="/login?hb-pwa="+${APP_BUILD_VERSION};login.textContent=" Abrir login";login.style.cssText="display:inline-block;margin-left:12px;color:#166534;font-weight:600";box.appendChild(login);
    host.appendChild(box);
  }catch(e){}
}
var p=(location.pathname||"").toLowerCase();
if(p==="/login"||p==="/cadastro"||p==="/esqueci-senha"||p.startsWith("/register")||p==="/forgot-password"){
  try{sessionStorage.removeItem("${directKey}");}catch(e){}
  hide();
  return;
}
try{if(sessionStorage.getItem("${PWA_REPAIR_SESSION_KEY}")===${JSON.stringify(PWA_REPAIR_SESSION_VERSION)}){sessionStorage.removeItem("${PWA_REPAIR_SESSION_KEY}");}}catch(e){}
var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;
if(!standalone&&!mobile){hide();return;}
if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){setTimeout(recoveryFallback,8000);return;}
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
    setTimeout(recoveryFallback,8000);
    return;
  }
  if(s&&hbCoopSessPilot(s)&&(standalone||mobile)){setTimeout(recoveryFallback,8000);return;}
}catch(e){}
try{if(sessionStorage.getItem("${directKey}")==="1"){el.style.display="flex";el.setAttribute("aria-hidden","false");setTimeout(recoveryFallback,8000);return;}}catch(e){}
setTimeout(recoveryFallback,8000);
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
