import assert from "node:assert/strict";
import {
  COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY,
  buildInlineCooperadoPwaStealthReloadScript,
} from "../src/lib/pwa/cooperadoPwaStealthReload";

assert.match(COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY, /stealth-reload-349/);
const script = buildInlineCooperadoPwaStealthReloadScript();
assert.match(script, /location\.reload\(\)/);
assert.match(script, /hb-coop-boot-shell/);

console.log("test-cooperado-pwa-stealth-reload: ok");
