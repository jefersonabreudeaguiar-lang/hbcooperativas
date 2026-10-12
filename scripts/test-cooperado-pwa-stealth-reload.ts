import assert from "node:assert/strict";
import {
  COOPERADO_PWA_STEALTH_RELOAD_ENABLED,
  COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY,
  buildInlineCooperadoPwaStealthReloadScript,
} from "../src/lib/pwa/cooperadoPwaStealthReload";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion";

assert.match(COOPERADO_PWA_STEALTH_RELOAD_SESSION_KEY, new RegExp(`stealth-reload-${APP_BUILD_VERSION}`));
const script = buildInlineCooperadoPwaStealthReloadScript();
if (COOPERADO_PWA_STEALTH_RELOAD_ENABLED) {
  assert.match(script, /location\.reload\(\)/);
  assert.match(script, /hb-coop-boot-shell/);
} else {
  assert.equal(script, "");
}

console.log("test-cooperado-pwa-stealth-reload: ok");
