/**
 * PC gestão — sem troca otimista / history.replace (menu não trava).
 * npx tsx scripts/test-staff-desktop-nav-policy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(read("src/lib/performance/staffDesktopNavPolicy.ts").includes("staffGestaoUsaNavegacaoOtimista"));
assert.ok(read("src/lib/performance/staffOptimisticTabNavigation.ts").includes("staffGestaoUsaNavegacaoOtimista"));
assert.ok(read("src/lib/performance/staffPinnedTabFastPath.ts").includes("staffGestaoUsaNavegacaoOtimista"));
assert.ok(read("src/hooks/useStaffEffectiveTabPath.ts").includes("clearStaffOptimisticTab"));
assert.ok(read("src/lib/staff/staffGestaoPausaTrabalhoPesado.ts").includes("isStaffMobileViewportActive"));

const sidebar = read("src/components/layout/AppLayout.tsx");
assert.ok(!sidebar.includes("tryStaffCachedInstantTabSwitch(pathname, item.href)"), "sidebar PC usa Link direto");

console.log("OK test-staff-desktop-nav-policy");
