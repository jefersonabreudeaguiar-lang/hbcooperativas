/**
 * Homologação HB Credit — sequência local segura.
 * Não altera produção; valida fundação + cloud + build.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

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

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} falhou (${r.status})`);
}

async function checkCloud() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Supabase não configurado em .env.local");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const critical = ["cooperativas"] as const;
  for (const table of critical) {
    const { error } = await sb.from(table).select("*").limit(1);
    if (error) throw new Error(`Tabela crítica ${table}: ${error.message}`);
    console.log(`  ok ${table}`);
  }

  for (const table of ["app_users", "notas_pedido"] as const) {
    const { error } = await sb.from(table).select("*").limit(1);
    if (error?.message?.includes("Could not find the table")) {
      console.log(`  ${table}: ausente (fluxo legado preservado)`);
    } else if (error) {
      console.log(`  ${table}: aviso — ${error.message}`);
    } else {
      console.log(`  ok ${table}`);
    }
  }

  const { error: hbErr } = await sb.from("hb_credit_accounts").select("id").limit(1);
  if (hbErr?.message?.includes("Could not find the table")) {
    console.log("  hb_credit_accounts: pendente (aplique migrations)");
    return false;
  }
  if (hbErr) throw new Error(`hb_credit_accounts: ${hbErr.message}`);
  console.log("  ok hb_credit_accounts");
  return true;
}

async function main() {
  console.log("HB Credit — homologação\n");
  console.log("[1/4] testes fundação");
  run("npm", ["run", "test:hb-credit-foundation"]);

  console.log("\n[2/4] integridade app existente (Supabase)");
  const migrationsOk = await checkCloud();

  console.log("\n[3/4] build produção");
  run("npm", ["run", "build"], {
    HB_CREDIT_ENABLED: "false",
    NEXT_PUBLIC_HB_CREDIT_ENABLED: "false",
  });

  if (migrationsOk) {
    console.log("\n[4/4] testes engine (cloud)");
    run("npm", ["run", "test:hb-credit"], { HB_CREDIT_ENABLED: "true" });
  } else {
    console.log("\n[4/4] testes engine — skip (migrations HB Credit pendentes)");
  }

  console.log("\nHomologação concluída.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
