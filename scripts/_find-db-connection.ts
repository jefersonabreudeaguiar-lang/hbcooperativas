import pg from "pg";
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

const ref = "ifptyzikekrswippzmsf";
const rawPass = process.env.SUPABASE_DB_PASSWORD ?? "";
const passwords = [...new Set([rawPass, "Cod2020cod263696", rawPass.replace(/(.+)\1$/, "$1")].filter(Boolean))];

const regions = ["sa-east-1", "us-east-1", "us-east-2", "us-west-1", "eu-west-1", "ap-southeast-1"];

function urls(pass: string): string[] {
  const enc = encodeURIComponent(pass);
  const list = [`postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`];
  for (const region of regions) {
    for (const aws of ["aws-0", "aws-1"]) {
      list.push(`postgresql://postgres.${ref}:${enc}@${aws}-${region}.pooler.supabase.com:5432/postgres`);
      list.push(`postgresql://postgres.${ref}:${enc}@${aws}-${region}.pooler.supabase.com:6543/postgres`);
    }
  }
  return list;
}

async function tryConn(label: string, conn: string) {
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try {
    await c.connect();
    await c.query("select 1");
    await c.end();
    console.log("OK", label);
    return conn;
  } catch (e) {
    console.log("FAIL", label, (e as Error).message.split("\n")[0].slice(0, 120));
    try {
      await c.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

(async () => {
  for (const pass of passwords) {
    console.log("\n=== testing password length", pass.length, "===");
    const candidates = urls(pass);
    for (let i = 0; i < candidates.length; i++) {
      const ok = await tryConn(String(i + 1), candidates[i]!);
      if (ok) {
        console.log("\nWORKING_CONNECTION=" + ok.replace(/:[^:@]+@/, ":***@"));
        process.exit(0);
      }
    }
  }
  process.exit(1);
})();
