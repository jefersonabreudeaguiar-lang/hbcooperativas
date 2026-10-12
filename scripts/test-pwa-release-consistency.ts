import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateDomDeploymentConsistency,
  MIXED_DPL_ALIGN_SESSION_KEY,
  RELEASE_EPISODE_ALIGN_SESSION_KEY,
  RESCUE_PENDING_VERIFY_KEY,
} from "../src/lib/pwa/pwaReleaseConsistency";

const CANON = "dpl_DLGWPTTgCNrWxAkD69doGCxwVSar";

assert.deepEqual(
  evaluateDomDeploymentConsistency({ pageDeploymentId: CANON, loadedDeploymentIds: [] }),
  { status: "pending", reason: "no_scripts_yet" }
);

assert.deepEqual(
  evaluateDomDeploymentConsistency({
    pageDeploymentId: CANON,
    loadedDeploymentIds: [CANON, CANON],
  }),
  { status: "ok", canonicalDpl: CANON }
);

const mixed = evaluateDomDeploymentConsistency({
  pageDeploymentId: CANON,
  loadedDeploymentIds: [CANON, "dpl_otherDeploymentId1234567890AB"],
});
assert.equal(mixed.status, "mixed");

const boot = readFileSync(new URL("../src/lib/pwa/clientRelease.ts", import.meta.url), "utf8");
assert.match(boot, /hbAlignUrl/);
assert.match(boot, /hbEpisodeBlocked/);
assert.match(boot, /hardAlign\("mixed_dpl"/);
assert.doesNotMatch(boot, /if\(mixedDeploy\(\)\)\{try\{if\(sessionStorage\.getItem\(MIXED_ONCE_KEY\)\)/);

const align = readFileSync(new URL("../src/lib/pwa/htmlDeploymentAlign.ts", import.meta.url), "utf8");
assert.match(align, /caches\.keys/);
assert.match(align, /hbEpisodeBlocked/);
assert.match(align, /buildInlineReleaseEpisodeGuardScript/);
assert.match(align, /hbEpisodePending/);

const rescue = readFileSync(new URL("../public/pwa-rescue.html", import.meta.url), "utf8");
assert.match(rescue, new RegExp(RESCUE_PENDING_VERIFY_KEY));
assert.match(rescue, /RELEASE_FETCH_MS|fetchClientRelease/);
assert.doesNotMatch(rescue, /localStorage\.setItem\([^)]*repair-done-build/);

const nextCfg = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
assert.match(nextCfg, /immutable/);
assert.doesNotMatch(nextCfg, /_next\/static[\s\S]*no-store, must-revalidate/);

console.log("test-pwa-release-consistency: ok", {
  MIXED_DPL_ALIGN_SESSION_KEY,
  RESCUE_PENDING_VERIFY_KEY,
});
