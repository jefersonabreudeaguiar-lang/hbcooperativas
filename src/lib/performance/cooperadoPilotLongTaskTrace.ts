/** Rastreio local e temporário, ligado apenas pelo diagnóstico manual do piloto. */
export function buildInlineCooperadoPilotLongTaskTraceScript(): string {
  const enabledKey = "hb-coop-data-warm-trace-enabled";
  const traceKey = "hb-coop-longtask-trace";
  return `(function(){try{if(localStorage.getItem(${JSON.stringify(enabledKey)})!=="1")return;if(typeof PerformanceObserver==="undefined")return;var o=new PerformanceObserver(function(list){try{var rows=JSON.parse(localStorage.getItem(${JSON.stringify(traceKey)})||"[]");if(!Array.isArray(rows))rows=[];list.getEntries().forEach(function(e){rows.push({durationMs:Math.round(e.duration*100)/100,startMs:Math.round(e.startTime*100)/100,name:String(e.name||"").slice(0,40)});});localStorage.setItem(${JSON.stringify(traceKey)},JSON.stringify(rows.slice(-20)));}catch(e){}});o.observe({type:"longtask",buffered:true});}catch(e){}})();`;
}
