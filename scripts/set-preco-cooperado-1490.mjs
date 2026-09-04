import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: cur } = await sb.from("hb_platform_settings").select("cobranca_saas").eq("id", "default").maybeSingle();
const prev = cur?.cobranca_saas && typeof cur.cobranca_saas === "object" ? cur.cobranca_saas : {};
const next = {
  ...prev,
  precoCooperado: 14.9,
  minimoMes: typeof prev.minimoMes === "number" ? prev.minimoMes : 149,
  diaCobranca: typeof prev.diaCobranca === "number" ? prev.diaCobranca : 10,
  updatedAt: new Date().toISOString(),
};

const { error } = await sb.from("hb_platform_settings").upsert(
  { id: "default", cobranca_saas: next, updated_at: new Date().toISOString() },
  { onConflict: "id" }
);

if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}

console.log("hb_platform_settings atualizado:", JSON.stringify(next, null, 2));
