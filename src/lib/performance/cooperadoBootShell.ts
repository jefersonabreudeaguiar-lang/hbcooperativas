/**
 * Shell HTML estático no 1º paint (antes do bundle React) — PWA cooperado com sessão.
 * Cooperado: pinta o último Início do cache e some quando o React monta.
 */
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { PWA_DIRECT_ENTRY_SESSION_KEY } from "@/lib/pwa/clientRelease";
import { cooperadoMobilePilotInlineSessionHelperJs } from "@/lib/cooperado/cooperadoMobilePilotInlineSession";
import { COOPERADO_INICIO_CARD_STORAGE_VERSION } from "@/lib/cooperado/cooperadoAberturaInstantanea";

const SESSION_KEY = "coopeagriplla_session";

export function buildInlineCooperadoBootShellScript(): string {
  const directKey = PWA_DIRECT_ENTRY_SESSION_KEY;
  const cardPrefix = `hb.coop.inicioCard.v${COOPERADO_INICIO_CARD_STORAGE_VERSION}:`;
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
if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){hide();return;}
function sessUser(raw){try{var o=typeof raw==="string"?JSON.parse(raw):raw;if(!o)return null;if(o.role||o.cooperadoId)return o;if(o.user&&(o.user.role||o.user.cooperadoId))return o.user;return o;}catch(e){return null;}}
var standalone=window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches;
var mobile=window.matchMedia&&window.matchMedia("(max-width: 1023px)").matches;
function brl(n){
  var neg=n<0;n=Math.abs(Number(n)||0);var c=Math.round(n*100);
  var w=String(Math.floor(c/100));var f=String(c%100);if(f.length<2)f="0"+f;
  w=w.replace(/\\B(?=(\\d{3})+(?!\\d))/g,".");
  return (neg?"- ":"")+"R$ "+w+","+f;
}
function paintInicio(s){
  var nome=String(s&&s.name||"Cooperado").replace(/[<>&]/g,"").split(/\\s+/)[0]||"Cooperado";
  var valorTxt="";
  try{
    var prefix="${cardPrefix}";
    var cid=String(s&&s.cooperadoId||"");
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(!k||k.indexOf(prefix)!==0)continue;
      if(cid&&k.indexOf(":"+cid)===-1)continue;
      var card=JSON.parse(localStorage.getItem(k)||"null");
      if(card&&card.display&&typeof card.display.valor==="number"){
        valorTxt=brl(card.display.valor);
        break;
      }
    }
  }catch(e){}
  el.innerHTML='<div style="height:56px;background:#14532d;flex-shrink:0;display:flex;align-items:center;padding:0 16px;color:#fff;font-size:14px;font-weight:600">HB Cooperativas</div>'
    +'<div style="flex:1;padding:16px;max-width:32rem;margin:0 auto;width:100%">'
    +'<p style="font-size:18px;font-weight:600;color:#111827;margin:0">Olá, '+nome+'</p>'
    +(valorTxt
      ?'<div style="margin-top:16px;border:1px solid #bbf7d0;background:#fff;border-radius:12px;padding:16px"><p style="margin:0;font-size:13px;color:#6b7280">A receber</p><p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#166534">'+valorTxt+"</p></div>"
      :'<div style="margin-top:16px;height:96px;background:#fff;border-radius:12px;border:1px solid #e5e7eb"></div>')
    +"</div>";
  el.style.display="flex";
  el.setAttribute("aria-hidden","false");
}
try{
  var raw=localStorage.getItem("${SESSION_KEY}");
  if(raw){
    var s=sessUser(raw);
    if(s&&(s.role==="cooperado"||s.cooperadoId)){
      paintInicio(s);
      setTimeout(function(){
        var main=document.querySelector("main");
        var txt=((main&&main.innerText)||"").replace(/\\s+/g," ").trim();
        var panel=document.querySelector("[data-cooperado-tab-panel-active='1']");
        if((txt.length>48)||panel){hide();return;}
        try{
          el.innerHTML+='<div style="padding:16px;max-width:32rem;margin:0 auto;width:100%;text-align:center"><p style="font-size:14px;color:#374151;margin:0 0 12px">O painel nao abriu. Toque para reparar.</p><a href="/pwa-rescue.html?auto=1&next='+encodeURIComponent("/login?hb-pwa=${APP_BUILD_VERSION}")+'" style="display:inline-block;background:#15803d;color:#fff;font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none">Reparar e abrir de novo</a></div>';
        }catch(e){}
      },standalone?5000:7000);
      return;
    }
  }
}catch(e){}
try{if(sessionStorage.getItem("${directKey}")==="1"){el.style.display="flex";el.setAttribute("aria-hidden","false");return;}}catch(e){}
setTimeout(function(){
  var main=document.querySelector("main");
  var txt=((main&&main.innerText)||"").replace(/\\s+/g," ").trim();
  if(txt.length>48)hide();
},standalone||mobile?8000:3000);
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
