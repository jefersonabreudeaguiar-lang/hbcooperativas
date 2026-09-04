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

function cpfDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function nomeNorm(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const { data: coops } = await sb.from("cooperativas").select("id,nome,cnpj").order("nome");

for (const coop of coops ?? []) {
  const cnpj = String(coop.cnpj).replace(/\D/g, "");
  const { data: files } = await sb.storage.from("hb-cooperados").list(cnpj, { limit: 1000 });
  const cooperados = [];
  for (const f of files ?? []) {
    if (!f.name.endsWith(".json")) continue;
    const { data: blob } = await sb.storage.from("hb-cooperados").download(`${cnpj}/${f.name}`);
    if (!blob) continue;
    try {
      const parsed = JSON.parse(await blob.text());
      if (parsed?.cooperado?.id) cooperados.push({ ...parsed.cooperado, email: parsed.email });
    } catch {
      /* skip */
    }
  }

  const byCpf = new Map();
  const byNome = new Map();
  for (const c of cooperados) {
    const cpf = cpfDigits(c.cpfCnpj);
    if (cpf.length >= 11) {
      const list = byCpf.get(cpf) ?? [];
      list.push(c);
      byCpf.set(cpf, list);
    }
    const nome = nomeNorm(c.nomeCompleto);
    if (nome) {
      const list = byNome.get(nome) ?? [];
      list.push(c);
      byNome.set(nome, list);
    }
  }

  const dupCpf = [...byCpf.entries()].filter(([, list]) => list.length > 1);
  const dupNome = [...byNome.entries()].filter(([, list]) => list.length > 1);
  const ativos = cooperados.filter((c) => c.status !== "desligado");
  const desligados = cooperados.filter((c) => c.status === "desligado");

  console.log(`\n=== ${coop.nome} (${cnpj}) ===`);
  console.log(`Total storage: ${cooperados.length} | cobráveis (≠ desligado): ${ativos.length} | desligados: ${desligados.length}`);

  if (dupCpf.length) {
    console.log("\nDuplicados por CPF:");
    for (const [cpf, list] of dupCpf) {
      console.log(` CPF ${cpf}:`);
      for (const c of list) {
        console.log(`   - ${c.id} | ${c.nomeCompleto} | status=${c.status} | updated=${c.updatedAt}`);
      }
    }
  }
  if (dupNome.length) {
    console.log("\nDuplicados por nome:");
    for (const [nome, list] of dupNome) {
      if (list.length <= 1) continue;
      const cpfs = new Set(list.map((c) => cpfDigits(c.cpfCnpj)));
      if (cpfs.size === 1 && cpfs.values().next().value) continue;
      console.log(` "${nome}":`);
      for (const c of list) {
        console.log(`   - ${c.id} | cpf=${c.cpfCnpj ?? "—"} | status=${c.status}`);
      }
    }
  }

  const { data: users } = await sb
    .from("app_users")
    .select("id,email,name,cooperado_id,active,role")
    .eq("cooperativa_cnpj", cnpj)
    .eq("role", "cooperado");
  const dupLogin = new Map();
  for (const u of users ?? []) {
    if (!u.cooperado_id) continue;
    const list = dupLogin.get(u.cooperado_id) ?? [];
    list.push(u);
    dupLogin.set(u.cooperado_id, list);
  }
  const multiLoginSameCoop = [...dupLogin.entries()].filter(([, list]) => list.length > 1);
  const orphanLogins = (users ?? []).filter((u) => !cooperados.some((c) => c.id === u.cooperado_id));
  const cooperadosSemLogin = ativos.filter((c) => !(users ?? []).some((u) => u.cooperado_id === c.id && u.active));

  if (multiLoginSameCoop.length) {
    console.log("\nMúltiplos logins para mesmo cooperado_id:");
    for (const [cid, list] of multiLoginSameCoop) {
      for (const u of list) console.log(`   cooperado_id=${cid} | ${u.email} | active=${u.active}`);
    }
  }
  if (orphanLogins.length) {
    console.log("\nLogins órfãos (cooperado_id inexistente):");
    for (const u of orphanLogins) console.log(`   - ${u.email} | cooperado_id=${u.cooperado_id} | active=${u.active}`);
  }
  console.log(`Cooperados ativos sem login: ${cooperadosSemLogin.length}`);
}
