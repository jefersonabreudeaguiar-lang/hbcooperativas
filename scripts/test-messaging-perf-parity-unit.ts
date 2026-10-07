/**
 * Unitário — scoring HB vs WhatsApp (sem browser).
 */
import assert from "node:assert/strict";
import {
  buildMessagingParityReport,
  scoreMsLowerIsBetter,
  WHATSAPP_REFERENCE,
} from "../src/lib/performance/messagingAppPerfParity.ts";
import { buildRqlPerfRouteReport } from "../src/lib/performance/rqlPerfReport.ts";

assert.equal(scoreMsLowerIsBetter(55, WHATSAPP_REFERENCE.tabSwitchPaintP75Ms, 200), 10);
assert.equal(scoreMsLowerIsBetter(200, WHATSAPP_REFERENCE.tabSwitchPaintP75Ms, 200), 0);
assert.ok(scoreMsLowerIsBetter(120, WHATSAPP_REFERENCE.tabSwitchPaintP75Ms, 200)! > 5);

const report = buildMessagingParityReport({
  ...buildRqlPerfRouteReport(),
  paintPercentiles: { count: 3, p50: 90, p75: 150, p95: 180, max: 200 },
  routeTransitions: [],
});
assert.ok(report.hbCoopAverageScore > 0 && report.hbCoopAverageScore <= 10);
assert.ok(report.whatsappAverageScore > report.hbCoopAverageScore);

console.log("test-messaging-perf-parity-unit: OK");
