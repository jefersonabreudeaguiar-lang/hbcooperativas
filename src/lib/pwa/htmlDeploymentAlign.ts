/** Um reload por sessão se o HTML servido tiver dpl diferente do release canônico. */
export function buildInlineHtmlDeploymentAlignScript(): string {
  return `(function(){try{var htmlDpl=(document.documentElement.getAttribute("data-dpl-id")||"").trim();if(!htmlDpl||htmlDpl.indexOf("dpl_")!==0)return;var key="hb-coop-html-dpl-align-once";fetch("/api/client-release?_="+Date.now(),{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.ok?r.json():null;}).then(function(c){if(!c||!c.deploymentId)return;var cloud=String(c.deploymentId).trim();if(!cloud||cloud===htmlDpl)return;try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,"1");}catch(e){return;}location.reload();}).catch(function(){});}catch(e){}})();`;
}
