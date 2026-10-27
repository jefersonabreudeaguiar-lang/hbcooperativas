/** Browser (aba Chrome): remove SW legado que quebra navigate no /login. Ícone: não mexe. */
export function buildInlinePwaBrowserDetachServiceWorkerScript(): string {
  return `(function(){try{if(!("serviceWorker"in navigator))return;var standalone=false;try{standalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;}catch(e){}if(standalone)return;void navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});}catch(e){}})();`;
}
