import assert from "node:assert/strict";
import { evaluateDeploymentGuard } from "../src/lib/pwa/clientRelease";

const OFFICIAL = {
  build: 92,
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
  assert.match(d.reason, /mismatch/);
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

console.log("test-client-release-guard: ok");
