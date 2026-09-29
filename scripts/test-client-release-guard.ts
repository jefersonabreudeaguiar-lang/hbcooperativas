import assert from "node:assert/strict";
import {
  BLOCKED_VERCEL_DEPLOYMENT_IDS,
  evaluateBuildGuard,
  evaluateDeploymentGuard,
} from "../src/lib/pwa/clientRelease";

const OFFICIAL = {
  build: 93,
  deploymentId: "dpl_7MX5cFF9VD1mryPm3bK1em6kXxCs",
  gitCommitSha: "0cea0c1",
};

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: ["dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"],
    previouslySeenDeploymentId: null,
  });
  assert.equal(d.action, "reload");
  assert.match(d.reason, /blocked_deployment/);
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [],
    previouslySeenDeploymentId: null,
  });
  assert.equal(d.action, "pending");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [OFFICIAL.deploymentId],
    previouslySeenDeploymentId: "dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ",
  });
  assert.equal(d.action, "reload");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [OFFICIAL.deploymentId],
    previouslySeenDeploymentId: OFFICIAL.deploymentId,
  });
  assert.equal(d.action, "ok");
}

{
  const d = evaluateDeploymentGuard({
    official: OFFICIAL,
    loadedDeploymentIds: [OFFICIAL.deploymentId],
    previouslySeenDeploymentId: OFFICIAL.deploymentId,
    htmlDeploymentId: "dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ",
  });
  assert.equal(d.action, "reload");
  assert.match(d.reason, /blocked_html/);
}

{
  const d = evaluateBuildGuard({
    officialBuild: 93,
    htmlBuild: 91,
    previouslySeenBuild: "91",
  });
  assert.equal(d.action, "reload");
}

assert.ok(BLOCKED_VERCEL_DEPLOYMENT_IDS.includes("dpl_Eoe9gz7YBsqYNhY1LMM79ofEDrKZ"));

console.log("test-client-release-guard: ok");
