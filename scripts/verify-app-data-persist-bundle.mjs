/**
 * Falha o build se algum chunk chamar readAppDataPersistRaw de um módulo que não exporta a função (bug Turbopack).
 */
import fs from "fs";
import path from "path";

const chunksDir = path.join(process.cwd(), ".next/static/chunks");
if (!fs.existsSync(chunksDir)) {
  console.warn("verify-app-data-persist-bundle: skip (no .next/static/chunks)");
  process.exit(0);
}

let failed = false;

for (const file of fs.readdirSync(chunksDir)) {
  if (!file.endsWith(".js")) continue;
  const s = fs.readFileSync(path.join(chunksDir, file), "utf8");
  if (!s.includes("readAppDataPersistRaw")) continue;

  for (const m of s.matchAll(/\(0,([a-z])\.readAppDataPersistRaw\)/g)) {
    const at = m.index;
    const alias = m[1];
    const before = s.slice(0, at);
    const modId = [...before.matchAll(new RegExp(`${alias}=e\\.i\\((\\d+)\\)`, "g"))].pop()?.[1];
    if (!modId) continue;
    const modStart = s.indexOf(`${modId},e=>`);
    if (modStart < 0) continue;
    const hasExport = s.slice(modStart, modStart + 20_000).includes('"readAppDataPersistRaw",0,function');
    if (!hasExport) {
      console.error(`[persist-bundle] ${file}: ${alias}=e.i(${modId}) não exporta readAppDataPersistRaw`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("ok: readAppDataPersistRaw nos chunks");
