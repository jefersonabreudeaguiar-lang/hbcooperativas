import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";

const serviceWorker = readFileSync("public/sw.js", "utf8");
const changelog = readFileSync("docs/changelog/cooperado-por-build.md", "utf8").replace(/\r\n/g, "\n");
const swBuild = serviceWorker.match(/hb-coop-build-(\d+)-/);

assert.ok(swBuild, "service worker contém versão de build");
assert.equal(Number(swBuild[1]), APP_BUILD_VERSION, "service worker deve acompanhar o build do app");
assert.ok(changelog.startsWith(`# Changelog cooperado (por build)\n\nTexto curto para **suporte** e **cooperativas**. Conferir versão no celular: badge **\`v{N}\`** no header do PWA.\n\nProdução: https://hbcooperativas.vercel.app\n\n---\n\n## v${APP_BUILD_VERSION}\n`), "changelog documenta o build atual no topo");

console.log(`OK test-cooperado-release-version (v${APP_BUILD_VERSION} alinhado)`);
