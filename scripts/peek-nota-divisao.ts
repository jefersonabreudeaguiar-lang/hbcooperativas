import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const cnpj = "62351750000165";
const notaId = "np_1787160875774_sem0t";
async function main() {
  const { data: blob } = await supabase.storage.from("hb-entregas").download(`${cnpj}/${notaId}.json`);
  const nota = JSON.parse(await blob!.text());
  console.log(JSON.stringify(nota.divisaoEntrega, null, 2));
  console.log("\nItens count:", nota.itens?.length);
  console.log("Valor liquido:", nota.valorLiquido);
  console.log("Cooperado nota:", nota.cooperadoId, nota.cooperadoNomeSnapshot);
}
main().catch(console.error);
