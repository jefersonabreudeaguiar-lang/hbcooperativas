/**
 * Consolida cooperados duplicados na nuvem (mesmo CPF).
 * Marca duplicatas como desligado e aponta logins para o cadastro canônico.
 *
 * node scripts/repair-cooperados-duplicados-cloud.mjs
 * node scripts/repair-cooperados-duplicados-cloud.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const DRY_RUN = process.argv.includes("--dry-run");

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
function chave(c) {
  const cpf = cpfDigits(c.cpfCnpj);
  if (cpf.length >= 11) return `cpf:${cpf}`;
  return `nome:${nomeNorm(c.nomeCompleto)}`;
}
function score(c, loginIds) {
  let s = 0;
  if (loginIds.has(c.id)) s += 1_000_000;
  if (c.status === "ativo") s += 10_000;
  if (c.chavePix?.trim()) s += 100;
  s += Math.floor(new Date(c.updatedAt || c.createdAt || 0).getTime() / 1000);
  return s;
}

async function loadCooperados(cnpj) {
  const { data: files } = await sb.storage.from("hb-cooperados").list(cnpj, { limit: 1000 });
  const out = [];
  for (const f of files ?? []) {
    if (!f.name.endsWith(".json")) continue;
    const path = `${cnpj}/${f.name}`;
    const { data: blob } = await sb.storage.from("hb-cooperados").download(path);
    if (!blob) continue;
    const parsed = JSON.parse(await blob.text());
    if (parsed?.cooperado?.id) out.push({ path, parsed, cooperado: parsed.cooperado });
  }
  return out;
}

async function saveCooperado(path, parsed) {
  if (DRY_RUN) return;
  await sb.storage.from("hb-cooperados").upload(path, JSON.stringify(parsed), {
    contentType: "application/json",
    upsert: true,
  });
}

console.log(DRY_RUN ? "=== DRY RUN ===" : "=== REPARO ATIVO ===");

const { data: coops } = await sb.from("cooperativas").select("id,nome,cnpj").order("nome");
let totalDesligados = 0;
let totalLogins = 0;

for (const coop of coops ?? []) {
  const cnpj = String(coop.cnpj).replace(/\D/g, "");
  const entries = await loadCooperados(cnpj);
  if (!entries.length) continue;

  const { data: users } = await sb
    .from("app_users")
    .select("id,email,cooperado_id,active")
    .eq("cooperativa_cnpj", cnpj)
    .eq("role", "cooperado");
  const loginIds = new Set((users ?? []).map((u) => u.cooperado_id).filter(Boolean));

  const groups = new Map();
  for (const e of entries) {
    const key = chave(e.cooperado);
    if (!key || key === "nome:") continue;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  console.log(`\n${coop.nome} (${cnpj})`);
  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => score(b.cooperado, loginIds) - score(a.cooperado, loginIds));
    const canon = sorted[0];
    const dupes = sorted.slice(1);
    console.log(`  ${canon.cooperado.nomeCompleto} (${key})`);
    console.log(`    canônico: ${canon.cooperado.id}`);

    for (const d of dupes) {
      if (d.cooperado.status === "desligado") {
        console.log(`    já desligado: ${d.cooperado.id}`);
        continue;
      }
      console.log(`    desligar: ${d.cooperado.id}`);
      d.cooperado.status = "desligado";
      d.cooperado.updatedAt = new Date().toISOString();
      d.cooperado.observacoes = [
        d.cooperado.observacoes,
        `Cadastro duplicado consolidado em ${canon.cooperado.id} (${new Date().toISOString().slice(0, 10)}).`,
      ]
        .filter(Boolean)
        .join(" ");
      d.parsed.cooperado = d.cooperado;
      await saveCooperado(d.path, d.parsed);
      totalDesligados++;
    }

    for (const u of users ?? []) {
      if (!dupes.some((d) => d.cooperado.id === u.cooperado_id)) continue;
      const jaTemLoginCanonico = (users ?? []).some(
        (other) => other.id !== u.id && other.cooperado_id === canon.cooperado.id && other.active
      );
      const nextActive = jaTemLoginCanonico ? false : true;
      console.log(
        `    login ${u.email} → cooperado_id ${canon.cooperado.id}${nextActive ? "" : " (inativado — login duplicado)"}`
      );
      if (!DRY_RUN) {
        await sb
          .from("app_users")
          .update({ cooperado_id: canon.cooperado.id, active: nextActive })
          .eq("id", u.id);
      }
      totalLogins++;
    }
  }

  const ativosUnicos = new Set();
  for (const e of entries) {
    if (e.cooperado.status === "desligado") continue;
    ativosUnicos.add(chave(e.cooperado));
  }
  console.log(`  Cobráveis únicos após reparo: ${ativosUnicos.size}`);
}

console.log(`\nConcluído. Desligados: ${totalDesligados}. Logins realinhados: ${totalLogins}.`);
