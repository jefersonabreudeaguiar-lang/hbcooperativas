/**
 * Scripts inline destrutivos no <head> ficam desligados no browser para cooperado
 * (sessão local) — alinhamento só no ícone ou via banner manual.
 */
export function buildInlineCooperadoBrowserSkipDestructiveHeadBootScript(): string {
  return `(function(){try{window.__HB_COOP_SKIP_HEAD_DESTRUCTIVE_BOOT=false;function coop(){try{var raw=localStorage.getItem("coopeagriplla_session");if(!raw)return false;var s=JSON.parse(raw);return!!(s&&(s.role==="cooperado"||s.cooperadoId));}catch(e){return false;}}function browser(){try{return!window.matchMedia("(display-mode: standalone)").matches&&!window.navigator.standalone;}catch(e){return true;}}if(coop()&&browser())window.__HB_COOP_SKIP_HEAD_DESTRUCTIVE_BOOT=true;}catch(e){}})();`;
}
