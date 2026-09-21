/**
 * Diagnóstico Ana — duplicatas e assinatura na nuvem
 * node scripts/diag-ana-assinatura.mjs
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
const ANA_CPF = "54713340278";

function isAna(c) {
  const cpf = String(c.cpfCnpj ?? "").replace(/\D/g, "");
  if (cpf === ANA_CPF) return true;
  const nome = String(c.nomeCompleto ?? "").toLowerCase();
  return nome.includes("ana maria xavier");
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: files } = await sb.storage.from("hb-cooperados").list(CNPJ, { limit: 500 });
const anaRecords = [];
for (const f of files ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const { data: blob } = await sb.storage.from("hb-cooperados").download(`${CNPJ}/${f.name}`);
  if (!blob) continue;
  const parsed = JSON.parse(await blob.text());
  const c = parsed.cooperado;
  if (!c?.id || !isAna(c)) continue;
  anaRecords.push({
    file: f.name,
    email: parsed.email,
    id: c.id,
    nome: c.nomeCompleto,
    cpf: c.cpfCnpj,
    status: c.assinaturaCadastroStatus ?? (c.assinaturaCadastroDataUrl ? "legado" : "pendente"),
    versao: c.assinaturaCadastroVersao,
    cadastradaEm: c.assinaturaCadastradaEm,
    dataUrlLen: c.assinaturaCadastroDataUrl?.length ?? 0,
    appInstaladoEm: c.appInstaladoEm,
    updatedAt: c.updatedAt,
  });
}

console.log("=== Ana — arquivos hb-cooperados ===");
console.log(JSON.stringify(anaRecords, null, 2));

const anaIds = anaRecords.map((r) => r.id);
const { data: users } = await sb
  .from("app_users")
  .select("id,email,role,cooperado_id,cooperativa_cnpj,name")
  .eq("cooperativa_cnpj", CNPJ);
const anaUsers = (users ?? []).filter((u) => {
  if (anaIds.includes(u.cooperado_id)) return true;
  const em = String(u.email ?? "").toLowerCase();
  const nm = String(u.name ?? "").toLowerCase();
  return nm.includes("ana maria") || em.includes("anamaria") || em.includes("ana.maria");
});
console.log("\n=== app_users Ana ===");
console.log(JSON.stringify(anaUsers, null, 2));

// Duplicatas Cleones também
function isCleones(c) {
  return String(c.nomeCompleto ?? "").toLowerCase().includes("cleones");
}
const cleones = [];
for (const f of files ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const { data: blob } = await sb.storage.from("hb-cooperados").download(`${CNPJ}/${f.name}`);
  if (!blob) continue;
  const parsed = JSON.parse(await blob.text());
  const c = parsed.cooperado;
  if (!c?.id || !isCleones(c)) continue;
  cleones.push({
    id: c.id,
    status: c.assinaturaCadastroStatus,
    versao: c.assinaturaCadastroVersao,
    dataUrlLen: c.assinaturaCadastroDataUrl?.length ?? 0,
    updatedAt: c.updatedAt,
  });
}
for (const id of ["c_1786721200698_8kwkv", "c_1785866278549_z9fa6"]) {
  const { data: blob } = await sb.storage.from("hb-cooperados").download(`${CNPJ}/${id}.json`);
  if (!blob) {
    console.log(id, "missing");
    continue;
  }
  const parsed = JSON.parse(await blob.text());
  console.log(id, "status=", parsed.cooperado?.status, "assin=", parsed.cooperado?.assinaturaCadastroStatus);
}

console.log(JSON.stringify(cleones, null, 2));
