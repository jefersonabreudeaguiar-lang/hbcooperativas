/**
 * Aba do responsável com JS velho recarrega o documento — não fica presa.
 * npx tsx scripts/test-responsavel-painel-recuperar-aba.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  staffDocumentoBuildAtrasado,
  staffPodeRecarregarDocumentoUmaVez,
} from "../src/lib/responsavel/staffPainelRecuperarAba.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

assert.equal(staffDocumentoBuildAtrasado(514, 521), true, "v514 atrasado em relação ao 521");
assert.equal(staffDocumentoBuildAtrasado(521, 521), false, "build atual não recarrega");
assert.equal(staffDocumentoBuildAtrasado(0, 521), false, "sem data-app-build não força reload");

assert.equal(
  staffPodeRecarregarDocumentoUmaVez({ pageBuild: 514, appBuild: 521, jaTentouNesteBuild: false }),
  true,
  "primeira vez no build novo: recarrega"
);
assert.equal(
  staffPodeRecarregarDocumentoUmaVez({ pageBuild: 514, appBuild: 521, jaTentouNesteBuild: true }),
  false,
  "já tentou neste build: não entra em loop"
);

for (const rel of [
  "src/components/responsavel/AbaLastGoodSafeRoot.tsx",
  "src/components/responsavel/StaffPainelSafeRoot.tsx",
  "src/components/responsavel/AppAreaSafeRoot.tsx",
]) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert.match(src, /recarregarAbaStaffDocumento/, `${rel} recarrega o documento`);
  assert.match(src, /staffAbaDeveRecarregarDocumento/, `${rel} detecta JS velho`);
  assert.doesNotMatch(
    src,
    /this\.setState\(\{ hasError: false/,
    `${rel} não remonta o JS que já caiu`
  );
}

console.log("ok: painel do responsável recarrega o documento quando o JS está velho");
