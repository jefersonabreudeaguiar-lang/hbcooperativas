/**
 * Auditoria cadastro mercados HB (read-only).
 * npx tsx scripts/audit-mercados-parceiros-once.ts [cnpj_coop]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { TERMO_MERCADO_CONTA_COOP_VERSAO } from "../src/config/termoUsoMercadoContaCoop";

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

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");

type Issue = { nivel: "bloqueio" | "aviso" | "ok"; msg: string };

function statusUi(db: string): string {
  const s = db.toUpperCase();
  if (s === "ACTIVE") return "ativo";
  if (s === "PENDING") return "pendente";
  if (s === "BLOCKED") return "bloqueado";
  return db;
}

function avaliar(
  p: Record<string, unknown>,
  user: Record<string, unknown> | null,
  pinResetPendente: boolean,
  pixChangePendente: boolean
): Issue[] {
  const issues: Issue[] = [];
  const st = statusUi(String(p.status));

  if (st === "pendente") {
    issues.push({ nivel: "bloqueio", msg: "Aguardando aprovação do responsável (HB → Mercados)" });
  }
  if (st === "bloqueado") {
    issues.push({ nivel: "bloqueio", msg: "Mercado bloqueado — cobranças suspensas" });
  }
  if (st === "ativo") {
    issues.push({ nivel: "ok", msg: "Status ACTIVE (aprovado)" });
  }

  if (!p.app_user_id) {
    issues.push({ nivel: "bloqueio", msg: "Sem app_user_id — login parceiro quebrado" });
  }

  if (!user) {
    issues.push({ nivel: "bloqueio", msg: "Usuário app_users não encontrado" });
  } else {
    if (user.active === false) issues.push({ nivel: "bloqueio", msg: "Usuário inativo no app_users" });
    if (String(user.role) !== "parceiro") {
      issues.push({ nivel: "bloqueio", msg: `Role app_users = ${user.role} (esperado parceiro)` });
    }
    const emailP = String(p.email ?? "").trim().toLowerCase();
    const emailU = String(user.email ?? "").trim().toLowerCase();
    if (emailP && emailU && emailP !== emailU) {
      issues.push({ nivel: "aviso", msg: `E-mail diverge: parceiro=${emailP} user=${emailU}` });
    }
    if (user.parceiro_id && String(user.parceiro_id) !== String(p.id)) {
      issues.push({ nivel: "bloqueio", msg: `parceiro_id no user (${user.parceiro_id}) ≠ parceiro ${p.id}` });
    }
    if (!user.parceiro_id) {
      issues.push({ nivel: "aviso", msg: "app_users.parceiro_id vazio (pode funcionar se app_user_id no parceiro estiver ok)" });
    }
  }

  if (st === "ativo") {
    if (!p.partner_terms_accepted_at) {
      issues.push({ nivel: "bloqueio", msg: "Termo HB não aceito — mercado não cobra até aceitar no painel" });
    } else if (String(p.partner_terms_version) !== TERMO_MERCADO_CONTA_COOP_VERSAO) {
      issues.push({
        nivel: "bloqueio",
        msg: `Termo desatualizado (${p.partner_terms_version} → exige ${TERMO_MERCADO_CONTA_COOP_VERSAO})`,
      });
    } else {
      issues.push({ nivel: "ok", msg: "Termo HB aceito na versão atual" });
    }

    const desconto = Number(p.partner_discount_percent ?? 0);
    if (!Number.isFinite(desconto)) {
      issues.push({ nivel: "aviso", msg: "Desconto contratual inválido" });
    } else if (desconto <= 0) {
      issues.push({ nivel: "aviso", msg: "Desconto contratual 0% — conferir com responsável" });
    }

    if (!p.pix_key) {
      issues.push({ nivel: "aviso", msg: "PIX não cadastrado — liquidação/pagamento ao mercado pendente" });
    } else {
      issues.push({ nivel: "ok", msg: "PIX cadastrado" });
    }

    if (!p.pin_hash) {
      issues.push({ nivel: "aviso", msg: "PIN financeiro não cadastrado — estornos bloqueados" });
    } else if (p.pin_locked_until && new Date(String(p.pin_locked_until)).getTime() > Date.now()) {
      issues.push({ nivel: "aviso", msg: "PIN financeiro bloqueado por tentativas" });
    } else {
      issues.push({ nivel: "ok", msg: "PIN financeiro cadastrado" });
    }
  }

  if (pinResetPendente) {
    issues.push({ nivel: "aviso", msg: "Reset de PIN financeiro aguardando responsável" });
  }
  if (pixChangePendente) {
    issues.push({ nivel: "aviso", msg: "Mudança de PIX aguardando cooperativa" });
  }

  const cnpjMercado = String(p.partner_cnpj ?? "");
  if (cnpjMercado.length !== 14) {
    issues.push({ nivel: "bloqueio", msg: "CNPJ mercado inválido" });
  }

  return issues;
}

function prontoParaUso(issues: Issue[], st: string): boolean {
  if (st !== "ativo") return false;
  return !issues.some((i) => i.nivel === "bloqueio");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: partners, error } = await sb
    .from("hb_credit_partners")
    .select("*")
    .eq("cooperative_cnpj", CNPJ)
    .order("name");

  if (error) throw new Error(error.message);

  const list = partners ?? [];
  console.log(`\n=== Mercados HB — cooperativa ${CNPJ} ===`);
  console.log(`Total: ${list.length} | Termo vigente: ${TERMO_MERCADO_CONTA_COOP_VERSAO}\n`);

  if (list.length === 0) {
    console.log("Nenhum mercado cadastrado nesta cooperativa.");
    return;
  }

  const userIds = [...new Set(list.map((p) => p.app_user_id).filter(Boolean))] as string[];
  const { data: users } = await sb.from("app_users").select("*").in("id", userIds.length ? userIds : ["__none__"]);
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const partnerIds = list.map((p) => p.id);
  const { data: pinReqs } = await sb
    .from("hb_credit_partner_pin_reset_requests")
    .select("partner_id,status")
    .in("partner_id", partnerIds)
    .eq("status", "pendente");
  const pinResetSet = new Set((pinReqs ?? []).map((r) => r.partner_id));

  const { data: pixReqs } = await sb
    .from("hb_credit_partner_pix_change_requests")
    .select("partner_id,status")
    .in("partner_id", partnerIds)
    .eq("status", "pendente");
  const pixChangeSet = new Set((pixReqs ?? []).map((r) => r.partner_id));

  let prontos = 0;
  let comBloqueio = 0;

  for (const p of list) {
    const user = p.app_user_id ? userById.get(p.app_user_id) ?? null : null;
    const st = statusUi(String(p.status));
    const issues = avaliar(p, user, pinResetSet.has(p.id), pixChangeSet.has(p.id));
    const ok = prontoParaUso(issues, st);
    if (ok) prontos++;
    else if (issues.some((i) => i.nivel === "bloqueio")) comBloqueio++;

    console.log("—".repeat(60));
    console.log(`${p.name} | CNPJ ${p.partner_cnpj}`);
    console.log(`  id: ${p.id} | status: ${st} | login: ${user?.email ?? p.email}`);
    console.log(`  Pronto para uso (cobrar + fluxo HB): ${ok ? "SIM" : "NÃO"}`);
    for (const i of issues) {
      const tag = i.nivel === "ok" ? "✓" : i.nivel === "bloqueio" ? "✗" : "!";
      console.log(`  ${tag} ${i.msg}`);
    }
  }

  console.log("\n=== Resumo ===");
  console.log(`Prontos (ativo + sem bloqueios): ${prontos}/${list.length}`);
  console.log(`Com bloqueio operacional: ${comBloqueio}/${list.length}`);
  console.log(`Só avisos (podem operar cobrança se ativo + termo): ${list.length - prontos - comBloqueio}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
