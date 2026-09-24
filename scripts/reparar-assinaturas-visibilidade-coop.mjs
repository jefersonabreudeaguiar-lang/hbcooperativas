/**
 * Garante visibilidade das assinaturas para o responsável (CoopeagriPla).
 * node scripts/reparar-assinaturas-visibilidade-coop.mjs
 */
import { assertNotProductionTarget } from "./lib/assertNotProductionTarget.mjs";
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

function cpfDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function chave(c) {
  const cpf = cpfDigits(c.cpfCnpj);
  if (cpf.length >= 11) return `cpf:${cpf}`;
  return `nome:${String(c.nomeCompleto ?? "").trim().toLowerCase()}`;
}

function statusEff(c) {
  if (c.assinaturaCadastroStatus) return c.assinaturaCadastroStatus;
  if (c.assinaturaCadastroDataUrl?.trim()) return "confirmada";
  return "pendente";
}

const STATUS_RANK = { pendente: 0, devolvida: 1, em_analise: 2, confirmada: 3 };

function score(c, loginIds) {
  let s = 0;
  if (loginIds.has(c.id)) s += 1_000_000;
  const st = statusEff(c);
  if (st === "em_analise") s += 500_000;
  else if (st === "confirmada") s += 400_000;
  if (c.assinaturaCadastroDataUrl?.trim()) s += 50_000;
  s += (c.assinaturaCadastroVersao ?? 0) * 1_000;
  if (c.status === "ativo") s += 10_000;
  s += Math.floor(new Date(c.updatedAt || 0).getTime() / 1000);
  return s;
}

function mergeAssinatura(a, b) {
  const vA = a.assinaturaCadastroVersao ?? 0;
  const vB = b.assinaturaCadastroVersao ?? 0;
  const pick = (x) => ({ ...x });
  if (vB > vA) return pick(b);
  if (vA > vB) return pick(a);
  const rA = STATUS_RANK[statusEff(a)] ?? 0;
  const rB = STATUS_RANK[statusEff(b)] ?? 0;
  if (rB > rA) return pick(b);
  if (rA > rB) return pick(a);
  const lenA = a.assinaturaCadastroDataUrl?.length ?? 0;
  const lenB = b.assinaturaCadastroDataUrl?.length ?? 0;
  return lenB > lenA ? pick(b) : pick(a);
}
assertNotProductionTarget();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const { data: users } = await sb
  .from("app_users")
  .select("cooperado_id,email,role")
  .eq("cooperativa_cnpj", CNPJ)
  .eq("role", "cooperado");
const loginIds = new Set((users ?? []).map((u) => u.cooperado_id).filter(Boolean));

const { data: files } = await sb.storage.from("hb-cooperados").list(CNPJ, { limit: 500 });
const entries = [];
for (const f of files ?? []) {
  if (!f.name.endsWith(".json")) continue;
  const path = `${CNPJ}/${f.name}`;
  const { data: blob } = await sb.storage.from("hb-cooperados").download(path);
  if (!blob) continue;
  const parsed = JSON.parse(await blob.text());
  if (parsed?.cooperado?.id) entries.push({ path, parsed, cooperado: parsed.cooperado });
}

const groups = new Map();
for (const e of entries) {
  if (e.cooperado.status === "desligado") continue;
  const k = chave(e.cooperado);
  if (!k || k === "nome:") continue;
  const list = groups.get(k) ?? [];
  list.push(e);
  groups.set(k, list);
}

console.log("=== Reparo assinaturas — visibilidade responsável ===\n");

let desligados = 0;
let normalizados = 0;

for (const [key, list] of groups.entries()) {
  if (list.length <= 1) {
    const e = list[0];
    const c = e.cooperado;
    if (statusEff(c) === "em_analise" && !c.assinaturaCadastroStatus) {
      c.assinaturaCadastroStatus = "em_analise";
      c.updatedAt = new Date().toISOString();
      e.parsed.cooperado = c;
      await sb.storage.from("hb-cooperados").upload(e.path, JSON.stringify(e.parsed), {
        contentType: "application/json",
        upsert: true,
      });
      normalizados++;
      console.log("Status em_analise explícito:", c.nomeCompleto, c.id);
    }
    continue;
  }

  const sorted = [...list].sort((a, b) => score(b.cooperado, loginIds) - score(a.cooperado, loginIds));
  let canon = { ...sorted[0].cooperado };
  for (let i = 1; i < sorted.length; i++) {
    const merged = mergeAssinatura(canon, sorted[i].cooperado);
    canon = { ...canon, ...merged };
  }
  if (statusEff(canon) === "em_analise") canon.assinaturaCadastroStatus = "em_analise";
  if (statusEff(canon) === "confirmada" && !canon.assinaturaConfirmadaEm) {
    canon.assinaturaCadastroStatus = "confirmada";
    canon.assinaturaConfirmadaEm =
      canon.assinaturaConfirmadaEm ?? canon.assinaturaCadastradaEm ?? canon.updatedAt;
  }
  canon.updatedAt = new Date().toISOString();

  console.log(`\n${canon.nomeCompleto} (${key})`);
  console.log(`  canônico: ${canon.id} · ${statusEff(canon)} · foto ${canon.assinaturaCadastroDataUrl?.length ?? 0} chars`);

  sorted[0].cooperado = canon;
  sorted[0].parsed.cooperado = canon;
  await sb.storage.from("hb-cooperados").upload(sorted[0].path, JSON.stringify(sorted[0].parsed), {
    contentType: "application/json",
    upsert: true,
  });
  normalizados++;

  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i];
    if (d.cooperado.status === "desligado") continue;
    d.cooperado.status = "desligado";
    d.cooperado.updatedAt = new Date().toISOString();
    d.cooperado.observacoes = [d.cooperado.observacoes, `Duplicata desligada — usar ${canon.id}.`]
      .filter(Boolean)
      .join(" ");
    d.parsed.cooperado = d.cooperado;
    await sb.storage.from("hb-cooperados").upload(d.path, JSON.stringify(d.parsed), {
      contentType: "application/json",
      upsert: true,
    });
    desligados++;
    console.log(`  desligado: ${d.cooperado.id}`);
  }
}

console.log(`\nConcluído. Canônicos atualizados: ${normalizados}. Duplicatas desligadas: ${desligados}.`);

console.log("\n--- Em análise na nuvem (ativos) ---");
for (const e of entries) {
  const c = e.cooperado;
  if (c.status === "desligado") continue;
  if (statusEff(c) !== "em_analise") continue;
  console.log(`- ${c.nomeCompleto} (${c.id}) · foto ${c.assinaturaCadastroDataUrl?.length ?? 0}`);
}
