import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOCKED_VERCEL_DEPLOYMENT_IDS,
  evaluateClientReleaseAlignment,
  runtimeAlreadyOnCanonicalRelease,
  shouldAllowHardReload,
} from "../src/lib/pwa/clientRelease";

const CANONICAL = {
  build: 95,
  deploymentId: "dpl_7MX5cFF9VD1mryPm3bK1em6kXxCs",
  gitCommitSha: "0cea0c1",
};

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"],
  });
  assert.equal(d.action, "align");
  assert.match(d.reason, /blocked/);
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: [],
  });
  assert.equal(d.action, "pending");
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: { ...CANONICAL, deploymentId: "dpl_html_antigo" },
    loadedDeploymentIds: [CANONICAL.deploymentId],
  });
  assert.equal(d.action, "align");
  assert.match(d.reason, /page_dpl/);
  assert.equal(d.hard, false);
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: { ...CANONICAL, build: 94 },
    loadedDeploymentIds: [CANONICAL.deploymentId],
  });
  assert.equal(d.action, "align");
  assert.match(d.reason, /page_build/);
  assert.equal(d.hard, false);
}

{
  const d = evaluateClientReleaseAlignment({
    canonical: CANONICAL,
    pageRelease: CANONICAL,
    loadedDeploymentIds: [CANONICAL.deploymentId],
  });
  assert.equal(d.action, "ok");
}

assert.ok(BLOCKED_VERCEL_DEPLOYMENT_IDS.includes("dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"));
assert.equal(typeof shouldAllowHardReload("test"), "boolean");

{
  const canon = { build: 102, deploymentId: "dpl_new", gitCommitSha: "abc" };
  const embedded = { build: 101, deploymentId: "dpl_old", gitCommitSha: "" };
  assert.equal(
    runtimeAlreadyOnCanonicalRelease(canon, { build: 102, deploymentId: "dpl_new", gitCommitSha: "" }, embedded),
    false
  );
  assert.equal(
    runtimeAlreadyOnCanonicalRelease(
      canon,
      { build: 102, deploymentId: "dpl_new", gitCommitSha: "" },
      { build: 102, deploymentId: "dpl_new", gitCommitSha: "" }
    ),
    true
  );
  assert.equal(
    runtimeAlreadyOnCanonicalRelease(canon, { build: 101, deploymentId: "dpl_old", gitCommitSha: "" }, embedded),
    false
  );
}

{
  const boot = readFileSync(
    new URL("../src/lib/pwa/clientRelease.ts", import.meta.url),
    "utf8"
  );
  assert.match(boot, /checkBlockedOnly/);
  assert.doesNotMatch(boot, /pullCanonical/);
  assert.doesNotMatch(boot, /setTimeout\(function\(\)\{evaluate\(c\);\},600\)/);
  assert.match(boot, /markCurrentRuntimeReleaseSeen/);
}

console.log("test-client-release-guard: ok");
