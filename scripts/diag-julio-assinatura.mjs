/**
 * node scripts/diag-julio-assinatura.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const CNPJ = "62351750000165";

function isJulio(c) {
  return String(c.nomeCompleto ?? "").toLowerCase().includes("júlio cesar") ||
    String(c.nomeCompleto ?? "").toLowerCase().includes("julio cesar");
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: files } = await sb.storage.from("hb-cooperados").list(CNPJ, { limit: 500 });
for (const f of files ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const { data: blob } = await sb.storage.from("hb-cooperados").download(`${CNPJ}/${f.name}`);
  if (!blob) continue;
  const parsed = JSON.parse(await blob.text());
  const c = parsed.cooperado;
  if (!c?.id || !isJulio(c)) continue;
  console.log({
    id: c.id,
    nome: c.nomeCompleto,
    cpf: c.cpfCnpj,
    status: c.status,
    assinaturaStatus: c.assinaturaCadastroStatus,
    cadastradaEm: c.assinaturaCadastradaEm,
    versao: c.assinaturaCadastroVersao,
    confirmadaEm: c.assinaturaConfirmadaEm,
    confirmadaPor: c.assinaturaConfirmadaPorNome,
    dataUrlLen: c.assinaturaCadastroDataUrl?.length ?? 0,
    appInstaladoEm: c.appInstaladoEm,
    updatedAt: c.updatedAt,
  });
}

const { data: users } = await sb
  .from("app_users")
  .select("email,cooperado_id,name")
  .eq("cooperativa_cnpj", CNPJ);
console.log(
  "\nLogins Julio:",
  (users ?? []).filter((u) => String(u.name ?? "").toLowerCase().includes("julio"))
);
