import assert from "node:assert/strict";
import { scheduleStaffNavPrefetchEarly } from "../src/lib/performance/staffNavPrefetch";
import { staffGestaoUsaNavegacaoOtimista } from "../src/lib/performance/staffDesktopNavPolicy";
import { tryStaffCachedInstantTabSwitch, registerStaffTabPanelCacheProbe } from "../src/lib/performance/staffPinnedTabFastPath";

const timers = new Map<number, { fn: () => void; ms: number }>();
let seq = 0;
Object.assign(globalThis, { window: {
  matchMedia: () => ({ matches: true }),
  setTimeout: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { fn, ms }); return id; },
  clearTimeout: (id: number) => timers.delete(id),
}, document: { visibilityState: "visible" } });
const hrefs: string[] = [];
const router = { prefetch: (href: string) => { hrefs.push(href); } };
const stopA = scheduleStaffNavPrefetchEarly(router);
const stopB = scheduleStaffNavPrefetchEarly(router);
assert.equal(timers.size, 1, "dois bootstraps compartilham um único agendamento");
assert.deepEqual(hrefs, [], "não carrega telas durante o primeiro quadro");
let timer = [...timers.entries()][0]; timers.delete(timer[0]);
assert.equal(timer[1].ms, 4000); timer[1].fn();
assert.equal(hrefs.length, 1, "apenas uma rota por etapa");
stopA(); assert.equal(timers.size, 1, "segundo assinante mantém o agendamento");
timer = [...timers.entries()][0]; timers.delete(timer[0]);
assert.equal(timer[1].ms, 1500); timer[1].fn();
assert.equal(hrefs.length, 2);
stopB(); assert.equal(timers.size, 0, "último assinante cancela trabalho restante");
assert.equal(staffGestaoUsaNavegacaoOtimista(), false, "URL e conteúdo avançam pelo roteador mesmo no mobile");
registerStaffTabPanelCacheProbe(() => true);
assert.equal(tryStaffCachedInstantTabSwitch("/notas-pedido", "/ficha-corrida"), false, "cache não substitui histórico antes da navegação");
registerStaffTabPanelCacheProbe(null);
console.log("OK: um scheduler gradual, cancelável; rota mobile não usa histórico antecipado");
