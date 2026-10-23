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
  const build = APP_BUILD_VERSION;
  return `(function(){function run(){try{${pilotFn}
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
function sessUser(raw){try{var o=typeof raw==="string"?JSON.parse(raw):raw;if(!o)return null;if(o.role||o.cooperadoId)return o;if(o.user&&(o.user.role||o.user.cooperadoId))return o.user;return o;}catch(e){return null;}}
function appMontou(){
  if(document.querySelector("[data-cooperado-tab-panel-active='1']"))return true;
  if(document.querySelector("header")&&document.querySelector("main"))return true;
  var mode=document.documentElement.getAttribute("data-hb-shell-mode");
  if(mode&&mode!=="loading")return true;
  return false;
}
function brl(n){
  var neg=n<0;n=Math.abs(Number(n)||0);var c=Math.round(n*100);
  var w=String(Math.floor(c/100));var f=String(c%100);if(f.length<2)f="0"+f;
  w=w.replace(/\\B(?=(\\d{3})+(?!\\d))/g,".");
  return (neg?"- ":"")+"R$ "+w+","+f;
}
function paintInicio(s){
  var nome=String((s&&(s.name||s.nomeCompleto))||"Cooperado").replace(/[<>&]/g,"").split(/\\s+/)[0]||"Cooperado";
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
      :'<p style="margin:16px 0 0;font-size:14px;color:#6b7280">Abrindo o Início…</p>')
    +"</div>";
  el.style.display="flex";
  el.style.flexDirection="column";
  el.setAttribute("aria-hidden","false");
}
if(typeof localStorage==="undefined"||!localStorage.getItem("${SESSION_KEY}")){
  setTimeout(function(){if(appMontou())hide();},1200);
  return;
}
try{
  var raw=localStorage.getItem("${SESSION_KEY}");
  var s=sessUser(raw);
  if(s&&(s.role==="cooperado"||s.cooperadoId)){
    paintInicio(s);
  }
}catch(e){}
var ticks=0;
var iv=setInterval(function(){
  ticks+=1;
  if(appMontou()){clearInterval(iv);hide();return;}
  if(ticks>=20){
    clearInterval(iv);
    try{
      el.innerHTML+='<div style="padding:16px;max-width:32rem;margin:0 auto;width:100%;text-align:center"><a href="/pwa-rescue.html?auto=1&next='+encodeURIComponent("/login?hb-pwa=${build}")+'" style="display:inline-block;background:#15803d;color:#fff;font-weight:600;padding:12px 20px;border-radius:12px;text-decoration:none">Reparar e abrir de novo</a></div>';
    }catch(x){}
  }
},400);
}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);
else run();
})();`;
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
