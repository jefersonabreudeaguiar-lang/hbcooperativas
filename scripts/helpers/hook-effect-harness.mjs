/** Deterministic effect harness for event/race tests; not a browser latency benchmark. */
export function hookHarness() {
  const slots=[]; let cursor=0, effects=[], dirty=false;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    memo:fn=>fn,
    useRef(value){const i=cursor++;return slots[i]??=( {current:value} );},
    useState(initial){const i=cursor++;if(!slots[i]){const slot={value:typeof initial==='function'?initial():initial};slot.set=value=>{const next=typeof value==='function'?value(slot.value):value;if(!Object.is(next,slot.value)){slot.value=next;dirty=true;}};slots[i]=slot;}return [slots[i].value,slots[i].set];},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!equal(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
    useSyncExternalStore(subscribe,getSnapshot){const i=cursor++;if(!slots[i])slots[i]={cleanup:subscribe(()=>{dirty=true;})};return getSnapshot();},
  };
  return {react,render(fn){let result;for(let n=0;n<20;n++){cursor=0;effects=[];dirty=false;result=fn();const batch=effects;effects=[];for(const effect of batch)effect();if(!dirty)return result;}throw Error('Unexpected render loop');},cleanup(){for(const slot of slots)slot?.cleanup?.();}};
}
export function virtualTimers() {
  let id=0;const timers=new Map(),idle=new Map(),intervals=new Map();
  return {setTimeout(fn){const key=++id;timers.set(key,fn);return key;},clearTimeout(key){timers.delete(key);},requestIdleCallback(fn){const key=++id;idle.set(key,fn);return key;},cancelIdleCallback(key){idle.delete(key);},setInterval(fn){const key=++id;intervals.set(key,fn);return key;},clearInterval(key){intervals.delete(key);},flushTimers(){const jobs=[...timers.values()];timers.clear();for(const fn of jobs)fn();},flushIdle(){const jobs=[...idle.values()];idle.clear();for(const fn of jobs)fn();},get pending(){return timers.size+idle.size;}};
}
export function eventTarget(){const listeners=new Map();return {addEventListener(name,fn){const set=listeners.get(name)??new Set();set.add(fn);listeners.set(name,set);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},emit(name){for(const fn of [...(listeners.get(name)??[])])fn();}};}
