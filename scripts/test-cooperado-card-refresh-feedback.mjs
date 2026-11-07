/** Exercise the real hook's event effect and real rematerializer without mounting unrelated UI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

class TestWindow {
  listeners = new Map();
  depth = 0;
  addEventListener(type, listener) { const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) {
    if (++this.depth > 12) { this.depth--; throw Error('Snapshot refresh recursively rematerializes itself'); }
    try { for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event); }
    finally { this.depth--; }
    return true;
  }
}
const window = new TestWindow();
class CustomEvent { constructor(type) { this.type = type; } }
function load(source, deps = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, window, CustomEvent, require: name => deps[name] ?? {} });
  return exports;
}
const events = load(fs.readFileSync('src/lib/cooperado/cooperadoPwaLeveUiEvents.ts', 'utf8'));
let forced = 0, materialized = 0, paused = false, ticks = 0;
const actual = load(fs.readFileSync('src/lib/cooperado/cooperadoGaRevisionLightSync.ts', 'utf8'), {
  '@/lib/cooperado/cooperadoPwaLeveUiEvents': events,
  '@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery': { cooperadoPilotForcarRematerializacaoFinanceira() { forced++; } },
  '@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh': { cooperadoRematerializarFinanceiroLocalSePossivel() { materialized++; } },
  '@/lib/cooperado/cooperadoTabSwitchQuiescence': { cooperadoMobileUiQuiescenceActive: () => paused },
  '@/lib/cooperado/cooperadoGaPausaTrabalhoPesado': { cooperadoGaPausaTrabalhoFinanceiroPesado: () => paused },
});
const text = fs.readFileSync('src/hooks/useCooperadoInicioValorReceberCardState.ts', 'utf8');
const source = ts.createSourceFile('hook.ts', text, ts.ScriptTarget.Latest, true);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') {
    const callback = node.arguments[0];
    if (callback && callback.getText(source).includes('window.addEventListener(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT')) {
      assert.equal(effect, undefined, 'Only one matching event effect'); effect = callback.getText(source);
    }
  }
  ts.forEachChild(node, visit);
}
visit(source); assert.ok(effect, 'Real hook event effect must be present');
const user = { id: 'fixture', role: 'cooperado' };
const setup = vm.runInNewContext(`(${effect})`, {
  window, leituraSomentePwa: false, sessionUser: user,
  isCooperadoMobileGaPromoted: () => true,
  setPersistidoTick: fn => { ticks = fn(ticks); },
  rematerializarCooperadoValorCardLeve: actual.rematerializarCooperadoValorCardLeve,
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT: events.COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT,
  HB_A_RECEBER_HIBRIDO_EVENT: 'hb-test-debit-updated',
});
const cleanup = setup();
assert.doesNotThrow(() => events.dispatchCooperadoPwaLeveUiSnapshotRefresh(), 'Snapshot notification must not recursively rebuild and notify');
assert.equal(ticks, 1); assert.equal(forced, 0); assert.equal(materialized, 0);
window.dispatchEvent(new CustomEvent('hb-test-debit-updated'));
assert.equal(forced, 1, 'A debit change still rebuilds financial display once');
assert.equal(materialized, 1);
assert.ok(ticks >= 2 && ticks <= 3, 'Debit repaint and its completed snapshot stay bounded');
paused = true;
const before = ticks;
window.dispatchEvent(new CustomEvent('hb-test-debit-updated'));
assert.equal(forced, 1); assert.equal(materialized, 1);
assert.equal(ticks, before + 1, 'Even a deferred rebuild must repaint the changed debit');
cleanup();
const finalTicks = ticks;
events.dispatchCooperadoPwaLeveUiSnapshotRefresh();
window.dispatchEvent(new CustomEvent('hb-test-debit-updated'));
assert.equal(ticks, finalTicks, 'Unmount removes both listeners');
console.log('PASS: snapshot notification is read-only; HB changes rematerialize once; pause and listener cleanup preserved.');
