#!/usr/bin/env npx tsx
/**
 * Dev server com fronteira BIC LAB (.env.bic-lab sobrescreve Supabase → homolog).
 */
import { spawn } from "node:child_process";
import { loadBicLabEnv } from "./loadBicLabEnv";

const { hasBicLab } = loadBicLabEnv();
if (!hasBicLab) {
  console.error(
    "Ausente .env.bic-lab — copie .env.bic-lab.example e aponte NEXT_PUBLIC_SUPABASE_URL para homolog."
  );
  process.exit(1);
}

const supabaseRef =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1] ?? "?";
console.log(
  `[dev:bic-lab] Supabase: ${supabaseRef} (homolog LAB — login ≠ produção hbcooperativas.vercel.app)`
);

const child = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: process.cwd(),
});

child.on("exit", (code) => process.exit(code ?? 0));
