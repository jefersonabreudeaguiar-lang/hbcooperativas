import assert from "node:assert/strict";
import {
  buildPwaRescueCooperadoBrowserWorkaroundAbsoluteUrl,
  buildPwaRescueCooperadoBrowserWorkaroundHref,
} from "../src/lib/pwa/cooperadoPwaRescueUrl";

const href = buildPwaRescueCooperadoBrowserWorkaroundHref(348);
assert.match(href, /^\/pwa-rescue\.html\?auto=1&next=/);
const decodedNext = decodeURIComponent(href.split("next=")[1] ?? "");
assert.equal(decodedNext, "/login?hb-pwa=348&next=%2Fdashboard");

const abs = buildPwaRescueCooperadoBrowserWorkaroundAbsoluteUrl(
  "https://hbcooperativas.vercel.app",
  348
);
assert.equal(
  abs,
  "https://hbcooperativas.vercel.app/pwa-rescue.html?auto=1&next=%2Flogin%3Fhb-pwa%3D348%26next%3D%252Fdashboard"
);

import {
  COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY,
  isCooperadoPwaBrowserWorkaroundGloballyActive,
} from "../src/lib/pwa/cooperadoPwaBrowserWorkaround";

assert.equal(COOPERADO_PWA_BROWSER_WORKAROUND_OPT_OUT_KEY, "hb-coop-pwa-browser-workaround-opt-out");
assert.equal(typeof isCooperadoPwaBrowserWorkaroundGloballyActive(), "boolean");

console.log("test-cooperado-pwa-browser-workaround: ok");
